# Architecture relationship diagram

```mermaid
flowchart TB
  subgraph UX[Next.js App Router]
    Pages[Server-rendered pages]
    Clients[Interactive client components]
    API[Route Handlers]
    Proxy[Session refresh proxy]
  end

  subgraph Security[Security boundary]
    Guards[Server role guards]
    RLS[Supabase RLS]
    Audit[Append-only audit]
    Rate[Persistent rate limits]
  end

  subgraph Intelligence[AI application layer]
    Ingest[Document ingestion]
    RAG[Hybrid RAG]
    Agents[Nine structured agents]
    Graph[LangGraph workflow]
    Eval[Evaluation]
    Reports[Report generation]
  end

  subgraph Managed[Managed services]
    SA[Supabase Auth]
    PG[(PostgreSQL + pgvector)]
    Store[Private Storage]
    OA[OpenAI Responses + Embeddings]
    LS[LangSmith]
  end

  Clients --> API
  Pages --> Guards
  API --> Guards
  Proxy --> SA
  Guards --> RLS
  RLS --> PG
  API --> Rate
  API --> Audit
  API --> Ingest
  API --> RAG
  API --> Graph
  Ingest --> Store
  Ingest --> OA
  Ingest --> PG
  RAG --> PG
  RAG --> OA
  Graph --> Agents
  Agents --> RAG
  Agents --> OA
  Graph --> PG
  Eval --> RAG
  Eval --> Agents
  Reports --> PG
  Reports --> Store
  OA --> LS
```

The diagram is intentionally directional: UI modules call server boundaries, AI modules do not import UI, and every durable state transition ends in PostgreSQL.
