import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import "./composables/navMemory";
import { pref } from "./lib/storage";
import { router } from "./router";
import { routes } from "./routes";
import "./styles/app.css";

const theme = pref.get("theme");
if (theme) document.documentElement.dataset.theme = theme;

for (const r of routes) router.addRoute(r);

createApp(App).use(createPinia()).use(router).mount("#app");
