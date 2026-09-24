// Pages by URL. The flat app state maps onto these paths in router.ts (stateToLocation).
import type { RouteRecordRaw } from "vue-router";

export const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: () => import("./views/HomeView.vue") },
  { path: "/:market", name: "vehicles", component: () => import("./views/VehiclesView.vue") },
  {
    path: "/:market/parts-list",
    name: "partsList",
    component: () => import("./views/PartsListView.vue"),
  },
  {
    path: "/:market/description/:ts",
    name: "description",
    component: () => import("./views/XrefView.vue"),
  },
  {
    path: "/:market/codes/:codes",
    name: "codes",
    component: () => import("./views/CodesView.vue"),
  },
  { path: "/:market/search", name: "search", component: () => import("./views/SearchView.vue") },
  {
    path: "/:market/catalog/:kat",
    name: "catalog",
    component: () => import("./views/CatalogView.vue"),
  },
  {
    path: "/:market/catalog/:kat/plate/:plate",
    name: "plate",
    component: () => import("./views/PlateView.vue"),
  },
  {
    path: "/:market/catalog/:kat/graphic/:nav",
    name: "graphic",
    component: () => import("./views/GraphicNavView.vue"),
  },
  {
    path: "/:market/catalog/:kat/paint",
    name: "paint",
    component: () => import("./views/PaintView.vue"),
  },
  {
    path: "/:market/catalog/:kat/equipment/:equip?",
    name: "equipment",
    component: () => import("./views/EquipmentView.vue"),
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];
