const os = require("node:os");
const usage = process.memoryUsage();
console.log(JSON.stringify({
  timestamp: new Date().toISOString(), node: process.version,
  processRssBytes: usage.rss, processHeapUsedBytes: usage.heapUsed,
  freeMemoryBytes: os.freemem(), totalMemoryBytes: os.totalmem()
}, null, 2));
