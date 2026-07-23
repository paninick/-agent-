import type { McpServerProfile } from "./types";

export const seedMcpServerProfiles: McpServerProfile[] = [
  {
    serverId: "table-analysis-mcp",
    name: "Table Analysis MCP",
    transport: "stdio",
    authRequirement: "none",
    enabled: true,
    healthStatus: "registered",
    description: "Static descriptor for table profiling and summarization tools.",
    toolDescriptors: [
      {
        toolId: "table.profile",
        serverId: "table-analysis-mcp",
        name: "Profile Table",
        description: "Return a synthetic profile of tabular columns and row counts.",
        inputSchema: { type: "object", properties: { tableName: { type: "string" } }, required: ["tableName"] },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "table.compute_summary",
        serverId: "table-analysis-mcp",
        name: "Compute Table Summary",
        description: "Return a synthetic aggregate summary for a table.",
        inputSchema: { type: "object", properties: { metric: { type: "string" } }, required: ["metric"] },
        declaredEffect: "compute",
        enabled: true
      }
    ]
  },
  // === Reserved: weather-context-mcp ===
  // 预留原因：当前无真实天气 API 后端，SSE transport 与 api_key 认证尚未对接。
  // 激活条件：(1) 接入真实天气数据源并实现 SSE transport；(2) 通过环境变量注入有效 API key；
  //           (3) 将 enabled 改为 true，healthStatus 改为 "registered"。
  // 保留 healthStatus: "not_implemented" 以验证 McpHealthStatus 枚举完整性（见 mcp-registry.test.ts）。
  // enabled: false 防止运行时调用 — 调用将返回 transport_unavailable。
  {
    serverId: "weather-context-mcp",
    name: "Weather Context MCP",
    transport: "sse",
    authRequirement: "api_key",
    enabled: false,
    healthStatus: "not_implemented",
    description: "Reserved (not_implemented): weather context lookup via SSE. Disabled until a real weather API backend and API key are provisioned; calling returns transport_unavailable.",
    toolDescriptors: [
      {
        toolId: "weather.lookup_context",
        serverId: "weather-context-mcp",
        name: "Lookup Weather Context",
        description: "Return synthetic weather context for a location.",
        inputSchema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
        declaredEffect: "network",
        enabled: true
      }
    ]
  },
  // === Disabled: finance-data-mcp — 待提供 Bearer Token 后激活 ===
  // 激活条件：通过环境变量注入有效 JWT bearer token，并将 enabled 改为 true。
  {
    serverId: "finance-data-mcp",
    name: "Finance Data MCP",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: false,
    healthStatus: "registered",
    description: "Disabled static descriptor for finance data tools. Pending bearer token provisioning; set enabled to true once credentials are supplied via environment variables.",
    toolDescriptors: [
      {
        toolId: "finance.quote_snapshot",
        serverId: "finance-data-mcp",
        name: "Quote Snapshot",
        description: "Return a synthetic quote snapshot.",
        inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "hyperbrowser-mcp",
    name: "Hyperbrowser MCP",
    transport: "stdio",
    authRequirement: "api_key",
    enabled: true,
    healthStatus: "registered",
    description: "Web automation server providing scrape, structured extraction, and crawl capabilities via the Hyperbrowser platform. API key is supplied via HYPERBROWSER_API_KEY env var to the MCP server process; the descriptor itself stores no credentials.",
    toolDescriptors: [
      {
        toolId: "scrape_webpage",
        serverId: "hyperbrowser-mcp",
        name: "Scrape Webpage",
        description: "Retrieve content from a URL in markdown, html, links, and/or screenshot formats. Supports stealth mode, proxy routing, and CAPTCHA solving via sessionOptions.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to scrape." },
            outputFormat: {
              type: "array",
              items: { type: "string", enum: ["markdown", "html", "links", "screenshot"] },
              description: "Output formats to include in the response."
            },
            sessionOptions: {
              type: "object",
              properties: {
                useStealth: { type: "boolean" },
                useProxy: { type: "boolean" },
                solveCaptchas: { type: "boolean" },
                acceptCookies: { type: "boolean" }
              },
              additionalProperties: false
            }
          },
          required: ["url"],
          additionalProperties: false
        },
        declaredEffect: "network",
        enabled: true
      },
      {
        toolId: "extract_structured_data",
        serverId: "hyperbrowser-mcp",
        name: "Extract Structured Data",
        description: "Extract data from one or more webpages according to a natural-language prompt and an optional JSON schema. Supports URL wildcards and stealth sessions.",
        inputSchema: {
          type: "object",
          properties: {
            urls: {
              type: "array",
              items: { type: "string" },
              description: "URLs to extract from. Supports wildcards (e.g. https://example.com/products/*)."
            },
            prompt: { type: "string", description: "Instructions for extraction." },
            schema: {
              type: "object",
              description: "Optional JSON schema for the extracted data."
            },
            sessionOptions: {
              type: "object",
              properties: {
                useStealth: { type: "boolean" },
                useProxy: { type: "boolean" },
                solveCaptchas: { type: "boolean" },
                acceptCookies: { type: "boolean" }
              },
              additionalProperties: false
            }
          },
          required: ["urls", "prompt"],
          additionalProperties: false
        },
        declaredEffect: "network",
        enabled: true
      },
      {
        toolId: "crawl_webpages",
        serverId: "hyperbrowser-mcp",
        name: "Crawl Webpages",
        description: "Navigate through multiple pages on a site starting from a URL, optionally following links. Returns content in the requested formats for up to maxPages pages.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "Starting URL for the crawl." },
            outputFormat: {
              type: "array",
              items: { type: "string", enum: ["markdown", "html", "links", "screenshot"] }
            },
            followLinks: { type: "boolean", description: "Whether to follow links found on pages." },
            maxPages: { type: "number", description: "Maximum pages to crawl. Default 10." },
            ignoreSitemap: { type: "boolean", description: "Skip the site's sitemap when available." },
            sessionOptions: {
              type: "object",
              properties: {
                useStealth: { type: "boolean" },
                useProxy: { type: "boolean" },
                solveCaptchas: { type: "boolean" },
                acceptCookies: { type: "boolean" }
              },
              additionalProperties: false
            }
          },
          required: ["url"],
          additionalProperties: false
        },
        declaredEffect: "network",
        enabled: true
      }
    ]
  },
  {
    serverId: "neon-mcp",
    name: "Neon PostgreSQL MCP",
    transport: "stdio",
    authRequirement: "api_key",
    enabled: true,
    healthStatus: "registered",
    description: "Neon Serverless PostgreSQL MCP server providing project/branch management, schema inspection, and SQL execution. API key is supplied via the MCP server startup args (NEON_API_KEY); the descriptor itself stores no credentials.",
    toolDescriptors: [
      {
        toolId: "neon.list_projects",
        serverId: "neon-mcp",
        name: "List Neon Projects",
        description: "List all Neon projects accessible by the configured API key. Returns project IDs, names, region, and default branch info.",
        inputSchema: {
          type: "object",
          properties: {
            search: { type: "string", description: "Optional search filter for project names." }
          },
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "neon.create_project",
        serverId: "neon-mcp",
        name: "Create Neon Project",
        description: "Create a new Neon PostgreSQL project. Returns project ID, connection string, and default branch.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Project name." },
            regionId: { type: "string", description: "AWS region (e.g. aws-us-east-2)." },
            pgVersion: { type: "number", description: "PostgreSQL version (15 or 16)." }
          },
          required: ["name"],
          additionalProperties: false
        },
        declaredEffect: "write",
        enabled: true
      },
      {
        toolId: "neon.list_branches",
        serverId: "neon-mcp",
        name: "List Branches",
        description: "List database branches in a Neon project, including primary and child branches.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Neon project ID." }
          },
          required: ["projectId"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "neon.create_branch",
        serverId: "neon-mcp",
        name: "Create Branch",
        description: "Create a new database branch from an existing branch. Useful for dev/test isolation.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Neon project ID." },
            branchName: { type: "string", description: "Name for the new branch." },
            parentBranchId: { type: "string", description: "Parent branch ID to branch from." }
          },
          required: ["projectId", "branchName"],
          additionalProperties: false
        },
        declaredEffect: "write",
        enabled: true
      },
      {
        toolId: "neon.describe_tables",
        serverId: "neon-mcp",
        name: "Describe Database Tables",
        description: "Return schema descriptions of all tables in the specified database, including columns, types, and constraints.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Neon project ID." },
            branchId: { type: "string", description: "Branch ID." },
            dbName: { type: "string", description: "Database name (default: neondb)." }
          },
          required: ["projectId", "branchId"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "neon.run_sql",
        serverId: "neon-mcp",
        name: "Run SQL Query",
        description: "Execute a SQL statement on the specified Neon database. Returns rows for SELECT or affected-row count for DML/DDL. Use for memory_entries, memory_associations, reflex_pathways operations.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Neon project ID." },
            branchId: { type: "string", description: "Branch ID." },
            dbName: { type: "string", description: "Database name." },
            sql: { type: "string", description: "SQL statement to execute." }
          },
          required: ["projectId", "branchId", "sql"],
          additionalProperties: false
        },
        declaredEffect: "write",
        enabled: true
      },
      {
        toolId: "neon.run_sql_transaction",
        serverId: "neon-mcp",
        name: "Run SQL Transaction",
        description: "Execute multiple SQL statements as a single atomic transaction. All statements commit together or roll back on error.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Neon project ID." },
            branchId: { type: "string", description: "Branch ID." },
            dbName: { type: "string", description: "Database name." },
            sqlStatements: {
              type: "array",
              items: { type: "string" },
              description: "SQL statements to execute in the transaction."
            }
          },
          required: ["projectId", "branchId", "sqlStatements"],
          additionalProperties: false
        },
        declaredEffect: "write",
        enabled: true
      },
      {
        toolId: "neon.get_database_tables",
        serverId: "neon-mcp",
        name: "Get Database Tables",
        description: "Return a list of all table names in the specified database, lightweight alternative to describe_tables.",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string", description: "Neon project ID." },
            branchId: { type: "string", description: "Branch ID." },
            dbName: { type: "string", description: "Database name." }
          },
          required: ["projectId", "branchId"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  // === szfiu 股市数据 MCP 服务器 (streamable_http, JWT Bearer) ===
  {
    serverId: "szfiu-cn-f10",
    name: "szfiu A股 F10 数据",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: true,
    healthStatus: "registered",
    description: "A股上市公司 F10 基本面数据，包括公司简介、财务报表、股东结构、分红送股等。JWT token 通过 SZFIU_JWT_TOKEN 环境变量注入，描述符不存储凭据。",
    toolDescriptors: [
      {
        toolId: "szfiu.cn_f10.company_profile",
        serverId: "szfiu-cn-f10",
        name: "A股公司简介",
        description: "获取 A 股上市公司基本信息（公司全称、注册地址、主营业务、所属行业、上市日期等）。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "A 股股票代码，如 600519（贵州茅台）。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.cn_f10.financial_statements",
        serverId: "szfiu-cn-f10",
        name: "A股财务报表",
        description: "获取 A 股上市公司财务报表（资产负债表、利润表、现金流量表），支持按报告期查询。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "A 股股票代码。" },
            reportType: { type: "string", enum: ["balance", "income", "cashflow"], description: "报表类型：资产负债表/利润表/现金流量表。" },
            period: { type: "string", description: "报告期，如 2025Q4、2025Q3。" }
          },
          required: ["stockCode", "reportType"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.cn_f10.shareholders",
        serverId: "szfiu-cn-f10",
        name: "A股十大股东",
        description: "获取 A 股上市公司十大股东及持股比例，支持按报告期查询。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "A 股股票代码。" },
            period: { type: "string", description: "报告期。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "szfiu-hk-f10",
    name: "szfiu 港股 F10 数据",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: true,
    healthStatus: "registered",
    description: "港股上市公司 F10 基本面数据。JWT token 通过 SZFIU_JWT_TOKEN 环境变量注入。",
    toolDescriptors: [
      {
        toolId: "szfiu.hk_f10.company_profile",
        serverId: "szfiu-hk-f10",
        name: "港股公司简介",
        description: "获取港股上市公司基本信息。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "港股代码，如 00700（腾讯控股）。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.hk_f10.financial_statements",
        serverId: "szfiu-hk-f10",
        name: "港股财务报表",
        description: "获取港股上市公司财务报表。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "港股代码。" },
            reportType: { type: "string", enum: ["balance", "income", "cashflow"] },
            period: { type: "string" }
          },
          required: ["stockCode", "reportType"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "szfiu-us-f10",
    name: "szfiu 美股 F10 数据",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: true,
    healthStatus: "registered",
    description: "美股上市公司 F10 基本面数据。JWT token 通过 SZFIU_JWT_TOKEN 环境变量注入。",
    toolDescriptors: [
      {
        toolId: "szfiu.us_f10.company_profile",
        serverId: "szfiu-us-f10",
        name: "美股公司简介",
        description: "获取美股上市公司基本信息。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "美股代码，如 AAPL（Apple）。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.us_f10.financial_statements",
        serverId: "szfiu-us-f10",
        name: "美股财务报表",
        description: "获取美股上市公司财务报表（10-K/10-Q）。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "美股代码。" },
            reportType: { type: "string", enum: ["balance", "income", "cashflow"] },
            period: { type: "string" }
          },
          required: ["stockCode", "reportType"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "szfiu-cn-sdk",
    name: "szfiu A股 SDK 行情数据",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: true,
    healthStatus: "registered",
    description: "A股实时行情、K线、盘口数据。JWT token 通过 SZFIU_JWT_TOKEN 环境变量注入。",
    toolDescriptors: [
      {
        toolId: "szfiu.cn_sdk.realtime_quote",
        serverId: "szfiu-cn-sdk",
        name: "A股实时行情",
        description: "获取 A 股实时行情（最新价、涨跌幅、成交量、换手率等）。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "A 股股票代码，如 600519。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.cn_sdk.kline",
        serverId: "szfiu-cn-sdk",
        name: "A股K线数据",
        description: "获取 A 股 K 线数据（日/周/月线），支持指定时间范围。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "A 股股票代码。" },
            period: { type: "string", enum: ["daily", "weekly", "monthly"], description: "K 线周期。" },
            startDate: { type: "string", description: "开始日期 YYYY-MM-DD。" },
            endDate: { type: "string", description: "结束日期 YYYY-MM-DD。" }
          },
          required: ["stockCode", "period"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "szfiu-hk-sdk",
    name: "szfiu 港股 SDK 行情数据",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: true,
    healthStatus: "registered",
    description: "港股实时行情、K线数据。JWT token 通过 SZFIU_JWT_TOKEN 环境变量注入。",
    toolDescriptors: [
      {
        toolId: "szfiu.hk_sdk.realtime_quote",
        serverId: "szfiu-hk-sdk",
        name: "港股实时行情",
        description: "获取港股实时行情。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "港股代码，如 00700。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.hk_sdk.kline",
        serverId: "szfiu-hk-sdk",
        name: "港股K线数据",
        description: "获取港股 K 线数据。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string" },
            period: { type: "string", enum: ["daily", "weekly", "monthly"] },
            startDate: { type: "string" },
            endDate: { type: "string" }
          },
          required: ["stockCode", "period"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "szfiu-us-sdk",
    name: "szfiu 美股 SDK 行情数据",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: true,
    healthStatus: "registered",
    description: "美股实时行情、K线数据。JWT token 通过 SZFIU_JWT_TOKEN 环境变量注入。",
    toolDescriptors: [
      {
        toolId: "szfiu.us_sdk.realtime_quote",
        serverId: "szfiu-us-sdk",
        name: "美股实时行情",
        description: "获取美股实时行情。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "美股代码，如 AAPL。" }
          },
          required: ["stockCode"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.us_sdk.kline",
        serverId: "szfiu-us-sdk",
        name: "美股K线数据",
        description: "获取美股 K 线数据。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string" },
            period: { type: "string", enum: ["daily", "weekly", "monthly"] },
            startDate: { type: "string" },
            endDate: { type: "string" }
          },
          required: ["stockCode", "period"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  {
    serverId: "szfiu-toolkit",
    name: "szfiu 通用工具",
    transport: "streamable_http",
    authRequirement: "none",
    enabled: true,
    healthStatus: "registered",
    description: "szfiu 通用工具集，提供股票搜索、行业分类、市场概览等辅助功能。无需认证。",
    toolDescriptors: [
      {
        toolId: "szfiu.toolkit.search_stock",
        serverId: "szfiu-toolkit",
        name: "搜索股票",
        description: "按名称或代码模糊搜索股票，返回匹配的股票列表（含市场、代码、名称）。",
        inputSchema: {
          type: "object",
          properties: {
            keyword: { type: "string", description: "搜索关键词（股票名称或代码片段）。" },
            market: { type: "string", enum: ["cn", "hk", "us"], description: "限定市场。" }
          },
          required: ["keyword"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "szfiu.toolkit.industry_classification",
        serverId: "szfiu-toolkit",
        name: "行业分类",
        description: "获取行业分类列表或指定股票的行业归属。",
        inputSchema: {
          type: "object",
          properties: {
            stockCode: { type: "string", description: "可选 — 查询指定股票的行业归属。" },
            market: { type: "string", enum: ["cn", "hk", "us"] }
          },
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      }
    ]
  },
  // === 瑞幸咖啡 MCP 服务器 (streamable_http, JWT Bearer — 待激活) ===
  {
    serverId: "my-coffee",
    name: "瑞幸咖啡点单 MCP",
    transport: "streamable_http",
    authRequirement: "bearer_token",
    enabled: false, // 待用户提供实际 Token 后激活
    healthStatus: "registered",
    description: "瑞幸咖啡 (Luckin Coffee) 点单系统 MCP，支持查询附近门店、浏览菜单、下单、查询订单状态等。JWT token 通过 LKCOFFEE_JWT_TOKEN 环境变量注入，描述符不存储凭据。当前待激活 — 用户提供实际 Token 后将 enabled 改为 true。",
    toolDescriptors: [
      {
        toolId: "coffee.list_nearby_stores",
        serverId: "my-coffee",
        name: "查询附近门店",
        description: "根据经纬度查询附近的瑞幸咖啡门店列表，返回门店名称、地址、营业时间、距离等信息。",
        inputSchema: {
          type: "object",
          properties: {
            latitude: { type: "number", description: "纬度。" },
            longitude: { type: "number", description: "经度。" },
            radius: { type: "number", description: "搜索半径（米），默认 3000。" }
          },
          required: ["latitude", "longitude"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "coffee.get_menu",
        serverId: "my-coffee",
        name: "浏览菜单",
        description: "获取瑞幸咖啡菜单列表，包含饮品名称、价格、规格、可选配料等。支持按分类筛选。",
        inputSchema: {
          type: "object",
          properties: {
            storeId: { type: "string", description: "门店 ID（可选，不同门店菜单可能略有差异）。" },
            category: { type: "string", description: "分类筛选（如 '美式'、'拿铁'、'茶饮'），不传则返回全部。" }
          },
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "coffee.create_order",
        serverId: "my-coffee",
        name: "创建订单",
        description: "在指定门店创建咖啡订单。需要门店 ID、饮品列表（含规格和配料选择）、取餐方式（自取/外卖）。",
        inputSchema: {
          type: "object",
          properties: {
            storeId: { type: "string", description: "门店 ID。" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  productId: { type: "string", description: "饮品 ID。" },
                  quantity: { type: "number", description: "数量。" },
                  spec: { type: "string", description: "规格（如 '大杯'、'中杯'）。" },
                  extras: { type: "array", items: { type: "string" }, description: "额外配料（如 '加浓'、'燕麦奶'）。" }
                },
                required: ["productId", "quantity"]
              },
              description: "订单饮品列表。"
            },
            pickupType: { type: "string", enum: ["pickup", "delivery"], description: "取餐方式：自取/外卖。" }
          },
          required: ["storeId", "items", "pickupType"],
          additionalProperties: false
        },
        declaredEffect: "write",
        enabled: true
      },
      {
        toolId: "coffee.get_order_status",
        serverId: "my-coffee",
        name: "查询订单状态",
        description: "根据订单号查询订单状态（待制作/制作中/已完成/已取消）及取餐码。",
        inputSchema: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "订单号。" }
          },
          required: ["orderId"],
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "coffee.list_order_history",
        serverId: "my-coffee",
        name: "查询订单历史",
        description: "查询用户的历史订单列表，含订单时间、门店、金额、状态等。",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "返回条数上限，默认 20。" },
            startDate: { type: "string", description: "开始日期 YYYY-MM-DD（可选）。" },
            endDate: { type: "string", description: "结束日期 YYYY-MM-DD（可选）。" }
          },
          additionalProperties: false
        },
        declaredEffect: "read",
        enabled: true
      },
      {
        toolId: "coffee.cancel_order",
        serverId: "my-coffee",
        name: "取消订单",
        description: "取消指定订单（仅未开始制作的订单可取消）。",
        inputSchema: {
          type: "object",
          properties: {
            orderId: { type: "string", description: "订单号。" },
            reason: { type: "string", description: "取消原因（可选）。" }
          },
          required: ["orderId"],
          additionalProperties: false
        },
        declaredEffect: "write",
        enabled: true
      }
    ]
  }
];
