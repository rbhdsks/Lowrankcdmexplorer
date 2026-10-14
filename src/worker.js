import { runExperiment, runScalingStudy } from "./fit.js";

self.onmessage = event => {
  try {
    const { task, config } = event.data;
    const run = task === "scaling" ? runScalingStudy : runExperiment;
    const result = run(config, progress => self.postMessage({ type: "progress", progress }));
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
