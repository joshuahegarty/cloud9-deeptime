# Cloud9 Task Timer — Warehouse Manager & Operative Training Guide

Welcome to the **Cloud9 Task Timer (DeepTime)**. This guide explains everything the system does and how your team uses each tab on a daily basis, including the updated **Universal Standard 3PL Task Catalogue**, **Goods-In Intake Sub-Selection (`Containers` | `Pallets` | `Boxes`)**, **Pallet Build & Wrap**, and the separated **Cloud9 Internal / Housekeeping** tasks.

---

## What the System Does (At a Glance)

1. **Tracks Who Is Working on What, for Which Client, in Real Time**
   - Staff tap a client and a task to start their timer. When they move to another job, they simply tap the new task—the system automatically stops their previous timer and starts the new one.
   - **Top Quick-Select Bar**: Staff can launch tasks in 1 tap from **Assigned to You / Open Pool**, **Last 4 Recent Tasks**, or **Starred Favourites**, plus a **30-Minute 1-Click Resume** button if they briefly paused a task.
2. **Smart Output Quantity Capture & Live Tally (`+1` / `+5` / `+10`)**
   - **Standard Order Pick (`STD-PICK`)** (#1 Default Task) and **Standard Order Pack (`STD-PACK`)** (#2 Default Task) close cleanly without forcing a mandatory unit count (since Helm WMS records order counts).
   - All Goods-In, Pallet Build/Dispatch, Rework, Stock Take, and Bespoke tasks prompt for completed quantities on close—or staff can tap the **Live Tally (`-1`, `+1`, `+5`, `+10`)** buttons while working so the count is already pre-filled.
3. **Clean Separation of Task Sections (`2A` / `2B` / `2C` / `2D` / `2E`)**
   - **2A. Client-Specific Bespoke Tasks**: Custom tasks specific to the chosen client.
   - **2B. Universal Standard Warehouse Tasks**: Everyday billable/contract 3PL tasks led by **#1 Default: Standard Order Pick (`STD-PICK`)**, **Goods-In (`Containers` | `Pallets` | `Boxes`)**, **Pallet Build & Wrap (`STD-PALLET-BW`)**, **Pallet Wrap & Carrier Dispatch (`STD-DISPATCH`)**, **Rework, Relabelling & Barcoding (`STD-REWORK`)**, and **Stock Take & Cycle Count (`STD-STOCK`)**. *(Internal cleaning is strictly excluded from Universal Standard Tasks).*
   - **2C. Bespoke Projects (Collapsible Colour-Coded Folders)**: Group multi-task projects (e.g. *Q4 Retail Display Pre-Build*) into collapsible folders.
   - **2D. Task Not Listed**: Lets an operative type a custom job title if needed.
   - **2E. Cloud9 Internal / Housekeeping (`Our Cost`)**: Dedicated collapsible section at the bottom of `/now` for **Replenishment**, **Warehouse Sweeping & Aisle Cleaning**, **Cardboard Clean-Out & Baler Crushing**, **Packing Bench Consumables Restock**, **Empty Pallet Sorting**, **Forklift/MHE Daily Check**, and **Team Briefing**.
4. **Prevents Forgotten Timers, Mistakes & Forgotten Clock-Outs**
   - **Wrong Task Reselector & Mistake Checkbox**: Staff can swap a wrongly chosen task mid-run without losing elapsed time, or tick *"Accidental start / mistake"* when stopping.
   - **Dual Supervisor Idle Alerts (`15m` / `30m`)**: Alerts supervisors when an operative has no active task for 15+ minutes or no activity pulse for 30+ minutes.
   - **Automatic 19:00 Shift-End Close & Logout**: Automatically closes any running timers, ends open shifts, and logs out sessions at `19:00` (`7:00 PM`).
5. **Produces Instant Client Billing, Helm WMS Sync & Payroll Summaries**
   - Supports **Exact**, **Upward Rounding (`5m`, `6m`, `15m`, `30m`, `60m`)**, and the **15m Minimum + 5m Increment (`15m_min_5m_inc`)** rule.
   - Clickable **Audit Flags** in `/reports/billing` jump straight to `/entries` to fix anomalies before exporting invoices.

---

## Complete Task Catalogue Reference

### Section 2B: Universal Standard Warehouse Tasks (Available for All Clients)

| Sort | Code | Task Name | Unit Measure | Target | Default Billing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **#1 Default** | `STD-PICK` | **Standard Order Pick** | `orders` | `1.2m` | Auto Billed (Optional units on close) |
| **#2 Default** | `STD-PACK` | **Standard Order Pack** | `orders` | `1.0m` | Auto Billed (Optional units on close) |
| **Goods-In Hub** | `STD-GOODSIN` | **Goods-In (Containers / Pallets / Boxes)** | `pallets` | `10.0m` | Auto Billed (Has 3 inline sub-buttons below) |
| ↳ *Sub-Button 1* | `STD-GIN-CONT` | **Goods-In: Container Unload (De-Vanning)** | `containers` | `90.0m` | Needs Billed |
| ↳ *Sub-Button 2* | `STD-GIN-PAL` | **Goods-In: Pallet Receiving & Check-In** | `pallets` | `10.0m` | Auto Billed |
| ↳ *Sub-Button 3* | `STD-GIN-BOX` | **Goods-In: Boxes & Carton Receiving** | `boxes` | `1.5m` | Auto Billed |
| Inbound | `STD-PUTAWAY` | **Inbound Putaway to Racking / Pick Face** | `pallets` | `6.0m` | Auto Billed |
| Pick & Pack | `STD-B2B-PICK` | **B2B / Wholesale Case & Master Carton Pick** | `cases` | `1.0m` | Auto Billed |
| Outbound | `STD-PALLET-BW` | **Pallet Build & Wrap** | `pallets` | `8.0m` | Needs Billed |
| Outbound | `STD-DISPATCH` | **Pallet Wrap & Carrier Dispatch** | `pallets` | `5.0m` | Auto Billed |
| Outbound | `STD-LOAD` | **Container / Wagon Loading & Carrier Handover** | `pallets` | `6.0m` | Needs Billed |
| Value-Add | `STD-REWORK` | **Rework, Relabelling & Barcoding** | `units` | `0.5m` | Needs Billed |
| Value-Add | `STD-KITTING` | **Kitting, Bundling & Multi-Pack Assembly** | `kits` | `1.2m` | Needs Billed |
| Returns | `STD-RETURNS` | **Customer Returns Processing & Grading (RMA)** | `returns` | `2.5m` | Needs Billed |
| Inventory | `STD-QC` | **Quality Control (QC) & Batch Inspection** | `units` | `1.0m` | Needs Billed |
| Inventory | `STD-STOCK` | **Stock Take & Cycle Count** | `locations` | `0.25m` | Needs Billed |

---

### Section 2E: Cloud9 Internal / Housekeeping Tasks (`Our Cost` Only)

*(Strictly separated from Universal Standard Warehouse Tasks; triggers Supervisor Approval Queue on `/floor`)*

| Sort | Code | Internal / Housekeeping Task Name | Unit Measure | Target | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `INT-REPLEN` | **Replenishment (Pick-Face & Forward Locations)** | `pallets` | `6.0m` | Restocking forward pick bins from bulk storage |
| **2** | `STD-CLEAN` | **Warehouse Sweeping & Aisle Cleaning** | `aisles` | `15.0m` | Floor sweeping, aisle hygiene & bay cleaning |
| **3** | `INT-CARDBOARD` | **Cardboard Clean-Out & Baler Crushing** | `bales` | `15.0m` | Clearing empty cartons from pick aisles & loading baler |
| **4** | `INT-CONSUMABLES` | **Packing Bench Consumables Restock (Boxes, Tape, Void Fill)** | `benches` | `5.0m` | Restocking pack benches with cartons, tape & void fill |
| **5** | `INT-PALLETS` | **Empty Pallet Sorting & Loading Bay Clear-Down** | `stacks` | `10.0m` | Grading/stacking empty CHEP/Euro pallets & clearing bays |
| **6** | `INT-MHE` | **Forklift / MHE Daily Safety Check & Battery Swap** | `checks` | `10.0m` | Pre-shift forklift/PPT inspection & battery charging |
| **7** | `INT-BRIEFING` | **Team Briefing, Shift Handover & Training** | `sessions` | `15.0m` | Daily stand-up briefing, H&S toolbox talk & training |

---

## Tab-by-Tab Walkthrough

### 1. **Now** (`/now` — Personal Timer & Task Picker)
- **Active Timer Card**: Shows client, task, elapsed time, **Live Tally (`-1`, `+1`, `+5`, `+10`)**, **Warehouse Zone & Aisle Selector**, **Wrong Task? Change Task** reselector, and **STOP TASK**.
- **Top Quick-Select Bar**:
  - **Assigned to You & Open Pool**: Shows tasks queued by a supervisor or broadcast to the floor with a 1-click **Grab Task** button.
  - **Last 4 Recent Tasks** & **30-Min Resume**: One-tap buttons to jump back into recent work.
  - **Starred Favourites**: Any task starred with `★` appears here for instant access.
- **Goods-In Sub-Selection (`Containers` | `Pallets` | `Boxes`)**: On the `Goods-In` card in Section 2B, tap **📦 Containers**, **🪵 Pallets**, or **📫 Boxes** to start timing the exact intake format right away.
- **Hands-Free Voice Mode**: Tap the microphone button to speak commands like *"Start Standard Order Pick"* or *"Stop task"*.

### 2. **Floor** (`/floor` — Live Warehouse Overview, Task Queue & Crew Control)
- **Pre-Assign Task Queue & Open Pool Broadcast**: Queue the next task for specific operatives or broadcast an open job (e.g., *"Need 2 staff for Container Unload"*) so operatives can claim it.
- **Supervisor Approval Banner for `Our Cost`**: When an operative starts a Cloud9 Internal / Housekeeping task, approve it in 1 click on `/floor`.
- **Crew Start & Stop with Quantity Prompt**: Start a team on a container or wave together; stopping a crew prompts for total units completed and warns in red if `0` units are entered.
- **Warehouse Zone & Aisle Travel Heatmap**: Visualizes time and movement across `Zones A–D`, `Pack Bench`, `Goods-In Bay`, and `Dispatch`.

### 3. **Entries** (`/entries` — Daily Timesheets, Urgent Pace Filter & Helm WMS Sync)
- **Below-Target Urgent Filter (`<85%`)**: One-click filter to isolate low-efficiency entries that need review.
- **Red Zero-Productivity Alert Badge**: Highlights any entry >5 minutes closed with `0` units on a measured task.
- **Helm WMS Order Sync**: Upload or paste daily Helm WMS pick/pack order counts per client to reconcile against logged hours.

### 4. **Billing** (`/reports/billing` — Client Billing Extract & Clickable Audit Flags)
- Supports **Exact**, **Upward Rounding (`5m`, `10m`, `15m`)**, and **15m Min + 5m Increment (`15m_min_5m_inc`)**.
- Click any **Audit Flag** badge to jump straight to `/entries` filtered to that client/task for instant fixing.
