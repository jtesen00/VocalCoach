using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocalCoach.Modules.Progress.Infrastructure.Database.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "progress");

            migrationBuilder.CreateTable(
                name: "learner_progress",
                schema: "progress",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    passed = table.Column<int>(type: "integer", nullable: false),
                    total_seconds = table.Column<double>(type: "double precision", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_learner_progress", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_messages",
                schema: "progress",
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

            migrationBuilder.CreateTable(
                name: "processed_attempts",
                schema: "progress",
                columns: table => new
                {
                    attempt_id = table.Column<Guid>(type: "uuid", nullable: false),
                    processed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_processed_attempts", x => x.attempt_id);
                });

            migrationBuilder.CreateTable(
                name: "item_bests",
                schema: "progress",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    item_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    best_score = table.Column<int>(type: "integer", nullable: false),
                    passed_ever = table.Column<bool>(type: "boolean", nullable: false),
                    last_score = table.Column<int>(type: "integer", nullable: false),
                    last_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_item_bests", x => new { x.user_id, x.item_id });
                    table.ForeignKey(
                        name: "fk_item_bests_learner_progress_user_id",
                        column: x => x.user_id,
                        principalSchema: "progress",
                        principalTable: "learner_progress",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "practice_days",
                schema: "progress",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_practice_days", x => new { x.user_id, x.day });
                    table.ForeignKey(
                        name: "fk_practice_days_learner_progress_user_id",
                        column: x => x.user_id,
                        principalSchema: "progress",
                        principalTable: "learner_progress",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_outbox_messages_occurred_on_utc",
                schema: "progress",
                table: "outbox_messages",
                column: "occurred_on_utc",
                filter: "processed_on_utc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "item_bests",
                schema: "progress");

            migrationBuilder.DropTable(
                name: "outbox_messages",
                schema: "progress");

            migrationBuilder.DropTable(
                name: "practice_days",
                schema: "progress");

            migrationBuilder.DropTable(
                name: "processed_attempts",
                schema: "progress");

            migrationBuilder.DropTable(
                name: "learner_progress",
                schema: "progress");
        }
    }
}
