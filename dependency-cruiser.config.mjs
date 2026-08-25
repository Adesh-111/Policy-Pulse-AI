/** @type {import('dependency-cruiser').IConfiguration} */
const configuration = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-server-code-in-components",
      severity: "error",
      from: { path: "^components" },
      to: { path: "^lib/(openai|workflows|documents|supabase/admin|db)" },
    },
    {
      name: "no-ai-to-ui",
      severity: "error",
      from: { path: "^lib/(ai|rag|workflows)" },
      to: { path: "^(app|components)" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: "(^|/)(node_modules|.next|coverage|graphify-out)(/|$)",
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]+" } },
  },
};

export default configuration;
