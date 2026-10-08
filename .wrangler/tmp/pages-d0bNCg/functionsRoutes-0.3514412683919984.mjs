import { onRequestPost as __api_notifications__id__read_js_onRequestPost } from "D:\\Zcode\\event-intel\\functions\\api\\notifications\\[id]\\read.js"
import { onRequestPost as __api_pipeline_run_js_onRequestPost } from "D:\\Zcode\\event-intel\\functions\\api\\pipeline\\run.js"
import { onRequestGet as __api_events__code__js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\events\\[code].js"
import { onRequestGet as __api_documents_js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\documents.js"
import { onRequestGet as __api_events_index_js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\events\\index.js"
import { onRequestGet as __api_health_js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\health.js"
import { onRequestGet as __api_meta_js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\meta.js"
import { onRequestGet as __api_notifications_index_js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\notifications\\index.js"
import { onRequestGet as __api_stats_js_onRequestGet } from "D:\\Zcode\\event-intel\\functions\\api\\stats.js"

export const routes = [
    {
      routePath: "/api/notifications/:id/read",
      mountPath: "/api/notifications/:id",
      method: "POST",
      middlewares: [],
      modules: [__api_notifications__id__read_js_onRequestPost],
    },
  {
      routePath: "/api/pipeline/run",
      mountPath: "/api/pipeline",
      method: "POST",
      middlewares: [],
      modules: [__api_pipeline_run_js_onRequestPost],
    },
  {
      routePath: "/api/events/:code",
      mountPath: "/api/events",
      method: "GET",
      middlewares: [],
      modules: [__api_events__code__js_onRequestGet],
    },
  {
      routePath: "/api/documents",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_documents_js_onRequestGet],
    },
  {
      routePath: "/api/events",
      mountPath: "/api/events",
      method: "GET",
      middlewares: [],
      modules: [__api_events_index_js_onRequestGet],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_js_onRequestGet],
    },
  {
      routePath: "/api/meta",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_meta_js_onRequestGet],
    },
  {
      routePath: "/api/notifications",
      mountPath: "/api/notifications",
      method: "GET",
      middlewares: [],
      modules: [__api_notifications_index_js_onRequestGet],
    },
  {
      routePath: "/api/stats",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_stats_js_onRequestGet],
    },
  ]