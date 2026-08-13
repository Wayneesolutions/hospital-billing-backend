// Vercel serverless entry point. Wraps the same Express app used for
// App Runner/ECS/local — no route logic duplicated here.
require("dotenv").config();
const app = require("../src/app");
module.exports = app;
