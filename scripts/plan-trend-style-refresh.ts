#!/usr/bin/env tsx
import "./load-env";
import { planFormulaRefresh } from "../lib/trend-styling/refresh-planner";

if (!process.argv.includes("--dry-run")) throw new Error("This planner is dry-run only; pass --dry-run");
const inputIndex = process.argv.indexOf("--input");
const candidates = inputIndex >= 0 ? JSON.parse(process.argv[inputIndex + 1] || "[]") : [];
console.log(JSON.stringify({ dryRun: true, schedulingEnabled: false, autoEnqueueImages: false, plans: planFormulaRefresh(candidates) }, null, 2));
