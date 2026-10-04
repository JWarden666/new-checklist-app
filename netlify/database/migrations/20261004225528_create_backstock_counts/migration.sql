CREATE TABLE "backstock_counts" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"days" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
