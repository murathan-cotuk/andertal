require("dotenv").config();
const express = require("express");
const payload = require("payload");

const app = express();

// Redirect root to admin
app.get("/", (_, res) => {
  res.redirect("/admin");
});

const start = async () => {
  // Initialize Payload
  await payload.init({
    secret: process.env.PAYLOAD_SECRET || "your-secret-key",
    express: app,
    onInit: async () => {
      payload.logger.info(`Payload Admin URL: ${payload.getAdminURL()}`);
      payload.logger.info(`GraphQL API: ${payload.getAdminURL()}/api/graphql`);
    },
  });

  // Add your own express routes here

  const port = process.env.PORT || 3001;

  app.listen(port, () => {
    payload.logger.info(`Server listening on port ${port}`);
  });
};

start();

