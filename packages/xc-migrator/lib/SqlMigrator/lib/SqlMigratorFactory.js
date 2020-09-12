/* eslint-disable no-unreachable */
const KnexMigrator = require("./KnexMigrator");

class SqlMigratorFactory {
  static create(args) {
    switch (args.client) {
      case "mysql2":
      case "mysql":
      case "pg":
      case "oracledb":
      case "mssql":
      case "sqlite3":
        return new KnexMigrator();
        break;
      default:
        throw new Error("Database not supported");
        break;
    }
  }
}

module.exports = SqlMigratorFactory;
