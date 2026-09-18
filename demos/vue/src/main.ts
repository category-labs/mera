import { createApp } from "vue";
import App from "./App.vue";
import { reportHeightWhenEmbedded } from "./embed";
import "./styles.css";

const stopReportingHeight = reportHeightWhenEmbedded();
const app = createApp(App);
app.mount("#root");
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    app.unmount();
    stopReportingHeight();
  });
