const { Pool } = require("pg");

console.log(process.env.DB_HOST);
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
pool.on("connect", () => {
  console.log("Logistic Databse Connected");
});

pool.on("error", (err) => {
  console.error("Database Connection Error", err);
  process.exit(1);
});

module.exports = pool;
