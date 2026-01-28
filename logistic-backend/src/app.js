require("dotenv").config();
const express = require("express");
const cors = require("cors");
require("./config/db");
const vehicleRoutes = require("./routes/vehicle.routes");
const orderRoutes = require("./routes/order.routes");
const driverRutes = require("./routes/driver.routes");
const assignmentRoutes = require("./routes/assignment.routes");
const routeRoutes = require("./routes/route.routes");
const app = express();
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }),
);

app.use(express.json());
app.use("/api/vehicles", vehicleRoutes);
// app.use("api/drivers", driverRutes);
app.use("/api/orders", orderRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/routes", routeRoutes);
app.get("/", (req, res) => {
  res.send("Logistic Backend running");
});

module.exports = app;
