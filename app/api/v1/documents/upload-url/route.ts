import { randomUUID } from "node:crypto";
import { apiRoute, json } from "@/lib/api/route";
import { permissions } from "@/lib/auth/roles";
import { writeAuditEvent } from "@/lib/audit/log";
import {
  documentMetadataSchema,
  sanitizeFileName,
  validateFileMetadata,
} from "@/lib/security/files";
import { departmentCodeFromName } from "@/lib/security/department";
import { ApiError } from "@/lib/security/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const POST = apiRoute(
  {
    roles: permissions.uploadPolicy,
    body: documentMetadataSchema,
    rateLimit: { scope: "document-upload-url", limit: 20, windowSeconds: 60 },
  },
  async ({ body, session, requestId }) => {
    const metadata = validateFileMetadata(body);
    const documentId = randomUUID();
    const safeName = sanitizeFileName(metadata.fileName);
    const extension = safeName.split(".").pop()?.toLowerCase() ?? "txt";
    const storagePath = `${session.organizationId}/${documentId}/${safeName}`;
    const supabase = await createServerSupabaseClient();
    let departmentIds = metadata.departmentIds;

    if (departmentIds.length === 0 && metadata.departmentName) {
      const departmentName = metadata.departmentName.trim();
      const admin = createAdminSupabaseClient();
      const { data: organizationDepartments, error: lookupError } = await admin
        .from("departments")
        .select("id,name,is_active")
        .eq("organization_id", session.organizationId);
      if (lookupError) throw lookupError;
      const existing = (organizationDepartments ?? []).find(
        (department) => department.name.trim().toLocaleLowerCase() === departmentName.toLocaleLowerCase(),
      );
      if (existing && !existing.is_active) {
        throw new ApiError(
          "That department is inactive. Ask an administrator to reactivate it.",
          409,
          "DEPARTMENT_INACTIVE",
        );
      }
      if (existing) {
        departmentIds = [existing.id];
      } else {
        const { data: created, error: createError } = await admin
          .from("departments")
          .upsert(
            {
              organization_id: session.organizationId,
              code: departmentCodeFromName(departmentName),
              name: departmentName,
              description: "Created during policy upload.",
            },
            { onConflict: "organization_id,code" },
          )
          .select("id,name,code,is_active")
          .single();
        if (createError) throw createError;
        departmentIds = [created.id];
        await writeAuditEvent({
          organizationId: session.organizationId,
          actorId: session.user.id,
          action: "department.created",
          targetType: "department",
          targetId: created.id,
          requestId,
          after: created,
          metadata: { source: "policy_upload" },
        });
      }
    }

    const { data: document, error: documentError } = await supabase.rpc(
      "create_document_record",
      {
        p_document_id: documentId,
        p_organization_id: session.organizationId,
        p_title: metadata.title,
        p_description: metadata.description,
        p_category: metadata.category,
        p_version: metadata.version,
        p_designation: metadata.designation,
        p_effective_date: metadata.effectiveDate,
        p_original_filename: safeName,
        p_mime_type: metadata.mimeType,
        p_file_extension: extension,
        p_file_size_bytes: metadata.fileSize,
        p_content_sha256: metadata.checksum.toLowerCase(),
        p_storage_path: storagePath,
        p_primary_department_id: departmentIds[0] ?? null,
        p_department_ids: departmentIds,
        p_metadata: {
          upload_protocol: "signed-url-v1",
          department_name: metadata.departmentName ?? null,
        },
      },
    );

    if (documentError) {
      const duplicate = /duplicate|content_sha256/i.test(documentError.message);
      throw new ApiError(
        duplicate
          ? "This policy file has already been uploaded."
          : "The document record could not be created.",
        duplicate ? 409 : 400,
        duplicate ? "DUPLICATE_DOCUMENT" : "DOCUMENT_CREATE_FAILED",
      );
    }

    const { data: signed, error: storageError } = await supabase.storage
      .from("policy-documents")
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (storageError || !signed) {
      await supabase
        .from("documents")
        .update({
          processing_status: "failed",
          processing_error: "A protected upload URL could not be created.",
        })
        .eq("id", documentId)
        .eq("organization_id", session.organizationId);
      throw new ApiError(
        "A protected upload URL could not be created.",
        503,
        "SIGNED_UPLOAD_FAILED",
      );
    }

    return json(
      {
        data: {
          document,
          documentId,
          bucket: "policy-documents",
          path: storagePath,
          signedUrl: signed.signedUrl,
          token: signed.token,
        },
      },
      { status: 201 },
    );
  },
);
