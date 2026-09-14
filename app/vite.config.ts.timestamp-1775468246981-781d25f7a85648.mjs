// vite.config.ts
import { defineConfig } from "file:///E:/map-editor/app/node_modules/vite/dist/node/index.js";
import path from "node:path";
import electron from "file:///E:/map-editor/app/node_modules/vite-plugin-electron/dist/simple.mjs";
import react from "file:///E:/map-editor/app/node_modules/@vitejs/plugin-react/dist/index.js";
import { fileURLToPath } from "node:url";
import { storybookTest } from "file:///E:/map-editor/app/node_modules/@storybook/addon-vitest/dist/vitest-plugin/index.js";
import { playwright } from "file:///E:/map-editor/app/node_modules/@vitest/browser-playwright/dist/index.js";
var __vite_injected_original_dirname = "E:\\map-editor\\app";
var __vite_injected_original_import_meta_url = "file:///E:/map-editor/app/vite.config.ts";
var dirname = typeof __vite_injected_original_dirname !== "undefined" ? __vite_injected_original_dirname : path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
function reactDevToolsPlugin() {
  return {
    name: "react-devtools",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { src: "http://localhost:8097" },
          injectTo: "head-prepend"
        }
      ];
    }
  };
}
var vite_config_default = defineConfig({
  plugins: [
    reactDevToolsPlugin(),
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: "electron/main.ts"
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__vite_injected_original_dirname, "electron/preload.ts")
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === "test" ? (
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        void 0
      ) : {}
    })
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    projects: [
      {
        name: "unit",
        test: {
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["./src/setupTests.ts"],
          globals: true
        }
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, ".storybook")
          })
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: "chromium"
              }
            ]
          },
          setupFiles: [".storybook/vitest.setup.ts"]
        }
      }
    ]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxtYXAtZWRpdG9yXFxcXGFwcFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRTpcXFxcbWFwLWVkaXRvclxcXFxhcHBcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0U6L21hcC1lZGl0b3IvYXBwL3ZpdGUuY29uZmlnLnRzXCI7Ly8vIDxyZWZlcmVuY2UgdHlwZXM9XCJ2aXRlc3QvY29uZmlnXCIgLz5cclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XHJcbmltcG9ydCBlbGVjdHJvbiBmcm9tICd2aXRlLXBsdWdpbi1lbGVjdHJvbi9zaW1wbGUnO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ25vZGU6dXJsJztcclxuaW1wb3J0IHsgc3Rvcnlib29rVGVzdCB9IGZyb20gJ0BzdG9yeWJvb2svYWRkb24tdml0ZXN0L3ZpdGVzdC1wbHVnaW4nO1xyXG5pbXBvcnQgeyBwbGF5d3JpZ2h0IH0gZnJvbSAnQHZpdGVzdC9icm93c2VyLXBsYXl3cmlnaHQnO1xyXG5pbXBvcnQgdHlwZSB7IFBsdWdpbiB9IGZyb20gJ3ZpdGUnO1xyXG5jb25zdCBkaXJuYW1lID1cclxuICB0eXBlb2YgX19kaXJuYW1lICE9PSAndW5kZWZpbmVkJyA/IF9fZGlybmFtZSA6IHBhdGguZGlybmFtZShmaWxlVVJMVG9QYXRoKGltcG9ydC5tZXRhLnVybCkpO1xyXG5cclxuLy8gSW5qZWN0cyB0aGUgcmVhY3QtZGV2dG9vbHMgc3RhbmRhbG9uZSBjb25uZWN0aW9uIHNjcmlwdCBpbiBkZXYgbW9kZSBvbmx5LlxyXG5mdW5jdGlvbiByZWFjdERldlRvb2xzUGx1Z2luKCk6IFBsdWdpbiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6ICdyZWFjdC1kZXZ0b29scycsXHJcbiAgICBhcHBseTogJ3NlcnZlJyxcclxuICAgIHRyYW5zZm9ybUluZGV4SHRtbCgpIHtcclxuICAgICAgcmV0dXJuIFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICB0YWc6ICdzY3JpcHQnLFxyXG4gICAgICAgICAgYXR0cnM6IHsgc3JjOiAnaHR0cDovL2xvY2FsaG9zdDo4MDk3JyB9LFxyXG4gICAgICAgICAgaW5qZWN0VG86ICdoZWFkLXByZXBlbmQnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF07XHJcbiAgICB9LFxyXG4gIH07XHJcbn1cclxuXHJcbi8vIE1vcmUgaW5mbyBhdDogaHR0cHM6Ly9zdG9yeWJvb2suanMub3JnL2RvY3MvbmV4dC93cml0aW5nLXRlc3RzL2ludGVncmF0aW9ucy92aXRlc3QtYWRkb25cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBwbHVnaW5zOiBbXHJcbiAgICByZWFjdERldlRvb2xzUGx1Z2luKCksXHJcbiAgICByZWFjdCgpLFxyXG4gICAgZWxlY3Ryb24oe1xyXG4gICAgICBtYWluOiB7XHJcbiAgICAgICAgLy8gU2hvcnRjdXQgb2YgYGJ1aWxkLmxpYi5lbnRyeWAuXHJcbiAgICAgICAgZW50cnk6ICdlbGVjdHJvbi9tYWluLnRzJyxcclxuICAgICAgfSxcclxuICAgICAgcHJlbG9hZDoge1xyXG4gICAgICAgIC8vIFNob3J0Y3V0IG9mIGBidWlsZC5yb2xsdXBPcHRpb25zLmlucHV0YC5cclxuICAgICAgICAvLyBQcmVsb2FkIHNjcmlwdHMgbWF5IGNvbnRhaW4gV2ViIGFzc2V0cywgc28gdXNlIHRoZSBgYnVpbGQucm9sbHVwT3B0aW9ucy5pbnB1dGAgaW5zdGVhZCBgYnVpbGQubGliLmVudHJ5YC5cclxuICAgICAgICBpbnB1dDogcGF0aC5qb2luKF9fZGlybmFtZSwgJ2VsZWN0cm9uL3ByZWxvYWQudHMnKSxcclxuICAgICAgfSxcclxuICAgICAgLy8gUGxveWZpbGwgdGhlIEVsZWN0cm9uIGFuZCBOb2RlLmpzIEFQSSBmb3IgUmVuZGVyZXIgcHJvY2Vzcy5cclxuICAgICAgLy8gSWYgeW91IHdhbnQgdXNlIE5vZGUuanMgaW4gUmVuZGVyZXIgcHJvY2VzcywgdGhlIGBub2RlSW50ZWdyYXRpb25gIG5lZWRzIHRvIGJlIGVuYWJsZWQgaW4gdGhlIE1haW4gcHJvY2Vzcy5cclxuICAgICAgLy8gU2VlIFx1RDgzRFx1REM0OSBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24tdml0ZS92aXRlLXBsdWdpbi1lbGVjdHJvbi1yZW5kZXJlclxyXG4gICAgICByZW5kZXJlcjpcclxuICAgICAgICBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Rlc3QnXHJcbiAgICAgICAgICA/IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi12aXRlL3ZpdGUtcGx1Z2luLWVsZWN0cm9uLXJlbmRlcmVyL2lzc3Vlcy83OCNpc3N1ZWNvbW1lbnQtMjA1MzYwMDgwOFxyXG4gICAgICAgICAgICB1bmRlZmluZWRcclxuICAgICAgICAgIDoge30sXHJcbiAgICB9KSxcclxuICBdLFxyXG4gIHRlc3Q6IHtcclxuICAgIGdsb2JhbHM6IHRydWUsXHJcbiAgICBlbnZpcm9ubWVudDogJ2pzZG9tJyxcclxuICAgIHNldHVwRmlsZXM6IFsnLi9zcmMvc2V0dXBUZXN0cy50cyddLFxyXG4gICAgcHJvamVjdHM6IFtcclxuICAgICAge1xyXG4gICAgICAgIG5hbWU6ICd1bml0JyxcclxuICAgICAgICB0ZXN0OiB7XHJcbiAgICAgICAgICBpbmNsdWRlOiBbJ3NyYy8qKi8qLnRlc3Que3RzLHRzeH0nXSxcclxuICAgICAgICAgIGVudmlyb25tZW50OiAnanNkb20nLFxyXG4gICAgICAgICAgc2V0dXBGaWxlczogWycuL3NyYy9zZXR1cFRlc3RzLnRzJ10sXHJcbiAgICAgICAgICBnbG9iYWxzOiB0cnVlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHtcclxuICAgICAgICBleHRlbmRzOiB0cnVlLFxyXG4gICAgICAgIHBsdWdpbnM6IFtcclxuICAgICAgICAgIC8vIFRoZSBwbHVnaW4gd2lsbCBydW4gdGVzdHMgZm9yIHRoZSBzdG9yaWVzIGRlZmluZWQgaW4geW91ciBTdG9yeWJvb2sgY29uZmlnXHJcbiAgICAgICAgICAvLyBTZWUgb3B0aW9ucyBhdDogaHR0cHM6Ly9zdG9yeWJvb2suanMub3JnL2RvY3MvbmV4dC93cml0aW5nLXRlc3RzL2ludGVncmF0aW9ucy92aXRlc3QtYWRkb24jc3Rvcnlib29rdGVzdFxyXG4gICAgICAgICAgc3Rvcnlib29rVGVzdCh7XHJcbiAgICAgICAgICAgIGNvbmZpZ0RpcjogcGF0aC5qb2luKGRpcm5hbWUsICcuc3Rvcnlib29rJyksXHJcbiAgICAgICAgICB9KSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHRlc3Q6IHtcclxuICAgICAgICAgIG5hbWU6ICdzdG9yeWJvb2snLFxyXG4gICAgICAgICAgYnJvd3Nlcjoge1xyXG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICBoZWFkbGVzczogdHJ1ZSxcclxuICAgICAgICAgICAgcHJvdmlkZXI6IHBsYXl3cmlnaHQoe30pLFxyXG4gICAgICAgICAgICBpbnN0YW5jZXM6IFtcclxuICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBicm93c2VyOiAnY2hyb21pdW0nLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgc2V0dXBGaWxlczogWycuc3Rvcnlib29rL3ZpdGVzdC5zZXR1cC50cyddLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICBdLFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQ0EsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sY0FBYztBQUNyQixPQUFPLFdBQVc7QUFHbEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFUM0IsSUFBTSxtQ0FBbUM7QUFBc0csSUFBTSwyQ0FBMkM7QUFXaE0sSUFBTSxVQUNKLE9BQU8scUNBQWMsY0FBYyxtQ0FBWSxLQUFLLFFBQVEsY0FBYyx3Q0FBZSxDQUFDO0FBRzVGLFNBQVMsc0JBQThCO0FBQ3JDLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLHFCQUFxQjtBQUNuQixhQUFPO0FBQUEsUUFDTDtBQUFBLFVBQ0UsS0FBSztBQUFBLFVBQ0wsT0FBTyxFQUFFLEtBQUssd0JBQXdCO0FBQUEsVUFDdEMsVUFBVTtBQUFBLFFBQ1o7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjtBQUdBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLG9CQUFvQjtBQUFBLElBQ3BCLE1BQU07QUFBQSxJQUNOLFNBQVM7QUFBQSxNQUNQLE1BQU07QUFBQTtBQUFBLFFBRUosT0FBTztBQUFBLE1BQ1Q7QUFBQSxNQUNBLFNBQVM7QUFBQTtBQUFBO0FBQUEsUUFHUCxPQUFPLEtBQUssS0FBSyxrQ0FBVyxxQkFBcUI7QUFBQSxNQUNuRDtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSUEsVUFDRSxRQUFRLElBQUksYUFBYTtBQUFBO0FBQUEsUUFFckI7QUFBQSxVQUNBLENBQUM7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixZQUFZLENBQUMscUJBQXFCO0FBQUEsSUFDbEMsVUFBVTtBQUFBLE1BQ1I7QUFBQSxRQUNFLE1BQU07QUFBQSxRQUNOLE1BQU07QUFBQSxVQUNKLFNBQVMsQ0FBQyx3QkFBd0I7QUFBQSxVQUNsQyxhQUFhO0FBQUEsVUFDYixZQUFZLENBQUMscUJBQXFCO0FBQUEsVUFDbEMsU0FBUztBQUFBLFFBQ1g7QUFBQSxNQUNGO0FBQUEsTUFDQTtBQUFBLFFBQ0UsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBO0FBQUE7QUFBQSxVQUdQLGNBQWM7QUFBQSxZQUNaLFdBQVcsS0FBSyxLQUFLLFNBQVMsWUFBWTtBQUFBLFVBQzVDLENBQUM7QUFBQSxRQUNIO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDSixNQUFNO0FBQUEsVUFDTixTQUFTO0FBQUEsWUFDUCxTQUFTO0FBQUEsWUFDVCxVQUFVO0FBQUEsWUFDVixVQUFVLFdBQVcsQ0FBQyxDQUFDO0FBQUEsWUFDdkIsV0FBVztBQUFBLGNBQ1Q7QUFBQSxnQkFDRSxTQUFTO0FBQUEsY0FDWDtBQUFBLFlBQ0Y7QUFBQSxVQUNGO0FBQUEsVUFDQSxZQUFZLENBQUMsNEJBQTRCO0FBQUEsUUFDM0M7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
