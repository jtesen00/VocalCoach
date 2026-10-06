using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocalCoach.Modules.Practice.Infrastructure.Database.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "practice");

            migrationBuilder.CreateTable(
                name: "attempts",
                schema: "practice",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    item_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    performed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    local_day = table.Column<DateOnly>(type: "date", nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    accuracy = table.Column<double>(type: "double precision", nullable: true),
                    passed = table.Column<bool>(type: "boolean", nullable: false),
                    duration_seconds = table.Column<double>(type: "double precision", nullable: false),
                    details = table.Column<string>(type: "jsonb", nullable: true),
                    received_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_attempts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_messages",
                schema: "practice",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    content = table.Column<string>(type: "jsonb", nullable: false),
                    occurred_on_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    processed_on_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_messages", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_attempts_user_id_item_id",
                schema: "practice",
                table: "attempts",
                columns: new[] { "user_id", "item_id" });

            migrationBuilder.CreateIndex(
                name: "ix_attempts_user_id_received_at_utc",
                schema: "practice",
                table: "attempts",
                columns: new[] { "user_id", "received_at_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_outbox_messages_occurred_on_utc",
                schema: "practice",
                table: "outbox_messages",
                column: "occurred_on_utc",
                filter: "processed_on_utc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "attempts",
                schema: "practice");

            migrationBuilder.DropTable(
                name: "outbox_messages",
                schema: "practice");
        }
    }
}
