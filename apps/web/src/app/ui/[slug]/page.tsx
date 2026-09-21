"use client";

import { Badge } from "@grid/ui/components/badge";
import {
	BottomBar,
	BottomBarItem,
	generateAaveLensNormalMap,
} from "@grid/ui/components/bottom-bar";
import { Button } from "@grid/ui/components/button";
import { Card, CardContent } from "@grid/ui/components/card";
import {
	GlassCard,
	GlassCardBadge,
	GlassCardContent,
	GlassCardDescription,
	GlassCardFooter,
	GlassCardHeader,
	GlassCardTitle,
} from "@grid/ui/components/glass-card";
import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	MotionAccordion,
} from "@grid/ui/components/motion/accordion";
import { type ButtonState, StatefulButton } from "@grid/ui/components/motion/button";
import { MotionCheckbox, StatefulCheckbox } from "@grid/ui/components/motion/checkbox";
import { MotionInput } from "@grid/ui/components/motion/input";
import {
	MotionSelect,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSearch,
	SelectTrigger,
	SelectValue,
} from "@grid/ui/components/motion/select";
import { MotionSlider } from "@grid/ui/components/motion/slider";
import { MotionSwitch, StatefulSwitch } from "@grid/ui/components/motion/switch";
import {
	MotionTable,
	MotionTableCell,
	MotionTableExpandableRow,
	MotionTableHead,
	MotionTablePagination,
	MotionTableRow,
	MotionTableSkeleton,
	sortRows,
	TableEmptyState,
	TableSortHead,
	useTableSelection,
	useTableSort,
} from "@grid/ui/components/motion/table";
import {
	Tabs as MotionTabs,
	TabsContent as MotionTabsContent,
	TabsList as MotionTabsList,
	TabsTrigger as MotionTabsTrigger,
} from "@grid/ui/components/motion/tabs";
import {
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@grid/ui/components/table";
import {
	NotTypeset,
	Typeset,
	type TypesetPreset,
	TypesetScroll,
} from "@grid/ui/components/typeset";
import {
	AccessibilityIcon,
	Add01Icon,
	ArrowDown01Icon,
	ArrowRightIcon,
	ArrowUp01Icon,
	ArrowUpDownIcon,
	BrushIcon,
	ChevronDownIcon,
	CodeIcon,
	Copy01Icon,
	CubeIcon,
	DatabaseIcon,
	Delete02Icon,
	Download01Icon,
	EyeIcon,
	Grid02Icon,
	Home01Icon,
	InboxIcon,
	InputTextIcon,
	Layers01Icon,
	Loading01Icon,
	Mail01Icon,
	Moon01Icon,
	Search01Icon,
	Settings02Icon,
	SmartPhone01Icon,
	SparklesIcon,
	Sun01Icon,
	TextFontIcon,
	Tick02Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { use, useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme";

const WEB_TABLE_SORT_CODE = `import {
  MotionTable,
  MotionTableRow,
  TableSortHead,
  useTableSort,
} from "@grid/ui/components/motion/table";
import { TableHeader, TableBody, TableCell } from "@grid/ui/components/table";

const STUDENTS = [
  { id: "1", name: "Elena Rostova", grade: "Grade 11", gpa: 3.95 },
  { id: "2", name: "Marcus Chen", grade: "Grade 10", gpa: 3.88 },
];

export function MotionTableSortDemo() {
  const sort = useTableSort({ key: "name", direction: "asc" });

  const sorted = [...STUDENTS].sort((a, b) => {
    if (!sort.sortKey || !sort.sortDirection) return 0;
    const aVal = a[sort.sortKey as keyof typeof a];
    const bVal = b[sort.sortKey as keyof typeof a];
    const cmp = String(aVal).localeCompare(String(bVal));
    return sort.sortDirection === "asc" ? cmp : -cmp;
  });

  return (
    <MotionTable>
      <TableHeader>
        <MotionTableRow interactive={false}>
          <TableSortHead
            sortDirection={sort.sortKey === "name" ? sort.sortDirection : null}
            onSort={() => sort.toggleSort("name")}
          >
            Student Name
          </TableSortHead>
          <TableSortHead
            sortDirection={sort.sortKey === "gpa" ? sort.sortDirection : null}
            onSort={() => sort.toggleSort("gpa")}
          >
            GPA
          </TableSortHead>
        </MotionTableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, idx) => (
          <MotionTableRow key={row.id} index={idx}>
            <TableCell className="font-semibold">{row.name}</TableCell>
            <TableCell>{row.gpa.toFixed(2)}</TableCell>
          </MotionTableRow>
        ))}
      </TableBody>
    </MotionTable>
  );
}`;

const WEB_TABLE_SELECT_CODE = `import {
  MotionTable,
  MotionTableRow,
  useTableSelection,
} from "@grid/ui/components/motion/table";
import { TableHeader, TableBody, TableHead, TableCell } from "@grid/ui/components/table";
import { MotionCheckbox } from "@grid/ui/components/motion/checkbox";

const ROWS = [
  { id: "1", name: "Elena Rostova", role: "Student" },
  { id: "2", name: "Marcus Chen", role: "Student" },
];

export function MotionTableSelectDemo() {
  const ids = ROWS.map((r) => r.id);
  const sel = useTableSelection(ids);

  return (
    <MotionTable>
      <TableHeader>
        <MotionTableRow interactive={false}>
          <TableHead className="w-12">
            <MotionCheckbox
              size="sm"
              checked={sel.isAllSelected}
              indeterminate={sel.isIndeterminate}
              onCheckedChange={sel.toggleAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
        </MotionTableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row, idx) => (
          <MotionTableRow key={row.id} index={idx} selected={sel.selectedKeys.has(row.id)}>
            <TableCell className="w-12">
              <MotionCheckbox
                size="sm"
                checked={sel.selectedKeys.has(row.id)}
                onCheckedChange={() => sel.toggleRow(row.id)}
              />
            </TableCell>
            <TableCell className="font-semibold">{row.name}</TableCell>
            <TableCell>{row.role}</TableCell>
          </MotionTableRow>
        ))}
      </TableBody>
    </MotionTable>
  );
}`;

const WEB_TABLE_EXPAND_CODE = `import {
  MotionTable,
  MotionTableExpandableRow,
} from "@grid/ui/components/motion/table";
import { TableHeader, TableBody, TableCell } from "@grid/ui/components/table";

const TASKS = [
  { id: "1", title: "Design system audit", status: "In progress", detail: "Review all tokens..." },
];

export function MotionTableExpandDemo() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <MotionTable>
      <TableHeader>
        <MotionTableRow interactive={false}>
          <TableHead>Task</TableHead>
          <TableHead>Status</TableHead>
        </MotionTableRow>
      </TableHeader>
      <TableBody>
        {TASKS.map((task, idx) => (
          <MotionTableExpandableRow
            key={task.id}
            rowIndex={idx}
            expanded={open === task.id}
            onExpand={(next) => setOpen(next ? task.id : null)}
            colSpan={2}
            detail={<p className="py-3 text-sm text-muted-foreground">{task.detail}</p>}
          >
            <TableCell className="font-semibold">{task.title}</TableCell>
            <TableCell>{task.status}</TableCell>
          </MotionTableExpandableRow>
        ))}
      </TableBody>
    </MotionTable>
  );
}`;

const WEB_TABLE_LIVE_CODE = `import { AnimatePresence } from "motion/react";
import {
  MotionTable,
  MotionTableRow,
} from "@grid/ui/components/motion/table";
import { TableHeader, TableBody, TableCell } from "@grid/ui/components/table";

const initial = [{ id: "1", name: "Elena Rostova", status: "Queued" }];

export function MotionTableLiveDemo() {
  const [rows, setRows] = useState(initial);

  const addRow = () =>
    setRows((prev) => [
      { id: String(Date.now()), name: \`New #\${prev.length + 1}\`, status: "Queued" },
      ...prev,
    ]);

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  return (
    <MotionTable>
      <TableHeader>
        <MotionTableRow interactive={false}>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </MotionTableRow>
      </TableHeader>
      <TableBody>
        <AnimatePresence>
          {rows.map((row, idx) => (
            <MotionTableRow key={row.id} index={idx}>
              <TableCell>{row.name}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell className="text-right">
                <button onClick={() => removeRow(row.id)}>Remove</button>
              </TableCell>
            </MotionTableRow>
          ))}
        </AnimatePresence>
      </TableBody>
    </MotionTable>
  );
}`;

const WEB_TABLE_EMPTY_CODE = `import {
  MotionTable,
  MotionTableRow,
  TableEmptyState,
} from "@grid/ui/components/motion/table";
import { TableHeader, TableBody, TableCell } from "@grid/ui/components/table";

export function MotionTableEmptyDemo() {
  const [rows, setRows] = useState<string[]>([]);

  return (
    <MotionTable>
      <TableHeader>
        <MotionTableRow interactive={false}>
          <TableHead>Name</TableHead>
        </MotionTableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableEmptyState
            colSpan={1}
            message="No students yet"
            description="Add a student to populate the roster."
            action={<button onClick={() => setRows(["Alex Rivera"])}>Add student</button>}
          />
        ) : (
          rows.map((name, idx) => (
            <MotionTableRow key={name} index={idx}>
              <TableCell>{name}</TableCell>
            </MotionTableRow>
          ))
        )}
      </TableBody>
    </MotionTable>
  );
}`;

const WEB_TABLE_SKELETON_CODE = `import {
  MotionTable,
  MotionTableSkeleton,
} from "@grid/ui/components/motion/table";
import { TableHeader, TableBody, TableHead, TableCell } from "@grid/ui/components/table";

export function MotionTableSkeletonDemo() {
  return (
    <MotionTable>
      <TableHeader>
        <MotionTableRow interactive={false}>
          <TableHead>Name</TableHead>
          <TableHead>GPA</TableHead>
        </MotionTableRow>
      </TableHeader>
      <MotionTableSkeleton rows={4} columns={2} />
    </MotionTable>
  );
}`;

const WEB_ACCORDION_CODE = `import {
  MotionAccordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@grid/ui/components/motion/accordion";

export function MotionAccordionDemo() {
  return (
    <MotionAccordion variant="contained" defaultValue={["item-1"]}>
      <AccordionItem value="item-1">
        <AccordionTrigger>What is Motion Accordion?</AccordionTrigger>
        <AccordionContent>
          A spring-animated layout accordion component with zero layout jitter.
        </AccordionContent>
      </AccordionItem>
    </MotionAccordion>
  );
}`;

const WEB_CHECKBOX_CODE = `import { MotionCheckbox, StatefulCheckbox } from "@grid/ui/components/motion/checkbox";

export function MotionCheckboxDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <MotionCheckbox defaultChecked size="sm" />
      <MotionCheckbox defaultChecked size="default" variant="indigo" />
      <MotionCheckbox defaultChecked size="lg" variant="emerald" />
      <MotionCheckbox indeterminate size="default" variant="default" />
      <StatefulCheckbox
        variant="destructive"
        onToggle={async (next) => {
          await new Promise((res) => setTimeout(res, 1200));
          return true;
        }}
      />
    </div>
  );
}`;

const WEB_SLIDER_CODE = `import { MotionSlider } from "@grid/ui/components/motion/slider";

export function MotionSliderDemo() {
  return (
    <div className="space-y-8 max-w-md w-full">
      <MotionSlider defaultValue={[45]} variant="default" showTicks step={10} />
      <MotionSlider defaultValue={[70]} variant="indigo" formatValue={(v) => \`\${v}%\`} />
      <MotionSlider defaultValue={[20, 80]} variant="emerald" />
    </div>
  );
}`;

const WEB_SWITCH_CODE = `import { MotionSwitch, StatefulSwitch } from "@grid/ui/components/motion/switch";

export function MotionSwitchDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <MotionSwitch defaultChecked size="sm" />
      <MotionSwitch defaultChecked size="default" variant="success" />
      <MotionSwitch defaultChecked size="lg" variant="indigo" />
      <StatefulSwitch
        variant="destructive"
        onToggle={async (next) => {
          await new Promise((res) => setTimeout(res, 1200));
          return true;
        }}
      />
    </div>
  );
}`;

const WEB_GLASS_CARD_CODE = `import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardDescription,
  GlassCardContent,
  GlassCardFooter,
  GlassCardBadge,
} from "@grid/ui/components/glass-card";

export function LiquidGlassCardDemo() {
  return (
    <GlassCard themeMode="auto" depth={48} curvature={75} chroma={0.85} blur={2.5}>
      <GlassCardHeader>
        <GlassCardBadge>Aave Lens Engine</GlassCardBadge>
        <GlassCardTitle>Liquid Glass Surface</GlassCardTitle>
        <GlassCardDescription>
          Real-time SVG light bending over DOM content with chromatic dispersion.
        </GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent>
        <p className="text-sm text-zinc-300">
          Refracting live DOM nodes with zero canvas screenshots or WebGL flags.
        </p>
      </GlassCardContent>
      <GlassCardFooter>
        <button className="px-4 py-2 rounded-xl bg-teal-500 text-black font-medium text-xs">
          Explore Optics
        </button>
      </GlassCardFooter>
    </GlassCard>
  );
}`;

const WEB_BOTTOM_BAR_CODE = `import { BottomBar, BottomBarItem } from "@grid/ui/components/bottom-bar";

export function OfficialAaveGlassStudioDemo() {
  const [active, setActive] = useState("home");
  return (
    <BottomBar
      themeMode="auto"
      value={active}
      onValueChange={setActive}
      switchScaleX={1.18}
      switchScaleY={1.35}
      stiffness={220}
      damping={15}
      mass={0.8}
    >
      <BottomBarItem value="home">Home</BottomBarItem>
      <BottomBarItem value="explore">Explore</BottomBarItem>
      <BottomBarItem value="profile">Profile</BottomBarItem>
    </BottomBar>
  );
}`;

const WEB_TABS_CODE = `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@grid/ui/components/motion/tabs";`;
const WEB_BUTTON_CODE = `import { MotionButton, StatefulButton } from "@grid/ui/components/motion/button";`;
const WEB_INPUT_CODE = `import { MotionInput } from "@grid/ui/components/motion/input";`;
const WEB_SELECT_CODE = `import { MotionSelect } from "@grid/ui/components/motion/select";`;
const WEB_TYPESET_CODE = `import { Typeset, TypesetScroll, NotTypeset } from "@grid/ui";`;

/* ─────────────────────────────────────────────────────────────────── */
/* Motion Table demo sub-components                                    */
/* ─────────────────────────────────────────────────────────────────── */

const SORT_STUDENTS = [
	{ id: "1", name: "Elena Rostova", grade: "Grade 11", attendance: "98.5%", gpa: 3.95 },
	{ id: "2", name: "Marcus Chen", grade: "Grade 10", attendance: "96.2%", gpa: 3.88 },
	{ id: "3", name: "Sophia Martinez", grade: "Grade 12", attendance: "99.1%", gpa: 4.0 },
	{ id: "4", name: "Liam O'Connor", grade: "Grade 9", attendance: "94.8%", gpa: 3.75 },
	{ id: "5", name: "Aisha Khan", grade: "Grade 11", attendance: "97.3%", gpa: 3.91 },
	{ id: "6", name: "Noah Patel", grade: "Grade 10", attendance: "95.6%", gpa: 3.82 },
];

function TableSortDemo({
	page,
	onPageChange,
	pageSize,
}: {
	page: number;
	onPageChange: (p: number) => void;
	pageSize: number;
}) {
	const sort = useTableSort<(typeof SORT_STUDENTS)[number]>({ key: "name", direction: "asc" });
	const sorted = sortRows(SORT_STUDENTS, sort);
	const totalPages = Math.max(1, Math.ceil(SORT_STUDENTS.length / pageSize));
	const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
	const safePage = Math.min(page, totalPages);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
					Sortable Columns (Spring Icons)
				</h4>
				<span className="text-xs font-mono text-muted-foreground">
					{sort.sortKey ? `sorted by ${sort.sortKey} ${sort.sortDirection}` : "click a header"}
				</span>
			</div>
			<div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-xs">
				<MotionTable>
					<TableHeader className="bg-muted/40">
						<MotionTableRow interactive={false}>
							<TableHead className="w-12 text-center">#</TableHead>
							<TableSortHead
								sortDirection={sort.sortKey === "name" ? sort.sortDirection : null}
								onSort={() => sort.toggleSort("name")}
							>
								Student Name
							</TableSortHead>
							<TableSortHead
								sortDirection={sort.sortKey === "grade" ? sort.sortDirection : null}
								onSort={() => sort.toggleSort("grade")}
							>
								Grade Level
							</TableSortHead>
							<TableSortHead
								sortDirection={sort.sortKey === "attendance" ? sort.sortDirection : null}
								onSort={() => sort.toggleSort("attendance")}
							>
								Attendance
							</TableSortHead>
							<TableSortHead
								sortDirection={sort.sortKey === "gpa" ? sort.sortDirection : null}
								onSort={() => sort.toggleSort("gpa")}
								className="text-end"
							>
								GPA
							</TableSortHead>
						</MotionTableRow>
					</TableHeader>
					<TableBody>
						{pageRows.map((row, idx) => (
							<MotionTableRow key={row.id} index={idx}>
								<TableCell className="text-center font-mono text-xs text-muted-foreground">
									{row.id}
								</TableCell>
								<TableCell className="font-semibold text-foreground">{row.name}</TableCell>
								<TableCell className="text-xs font-mono">{row.grade}</TableCell>
								<TableCell className="text-xs font-mono text-emerald-400">
									{row.attendance}
								</TableCell>
								<TableCell className="text-end font-mono font-bold text-teal-400">
									{row.gpa.toFixed(2)}
								</TableCell>
							</MotionTableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={4} className="text-xs font-mono text-muted-foreground">
								Average GPA
							</TableCell>
							<TableCell className="text-end font-mono font-bold text-teal-400">
								{(SORT_STUDENTS.reduce((acc, s) => acc + s.gpa, 0) / SORT_STUDENTS.length).toFixed(
									2,
								)}
							</TableCell>
						</TableRow>
					</TableFooter>
				</MotionTable>
				<MotionTablePagination
					page={safePage}
					totalPages={totalPages}
					onPageChange={onPageChange}
					totalItems={SORT_STUDENTS.length}
					pageSize={pageSize}
				/>
			</div>
		</div>
	);
}

const SELECT_ROWS = [
	{ id: "1", name: "Elena Rostova", role: "Student", status: "Active" },
	{ id: "2", name: "Marcus Chen", role: "Student", status: "Active" },
	{ id: "3", name: "Sophia Martinez", role: "Mentor", status: "Active" },
	{ id: "4", name: "Liam O'Connor", role: "Student", status: "Inactive" },
];

function TableSelectDemo({
	density,
	rowStyle,
	setDensity,
	setRowStyle,
}: {
	density: "compact" | "default" | "comfortable";
	rowStyle: "plain" | "striped";
	setDensity: (v: "compact" | "default" | "comfortable") => void;
	setRowStyle: (v: "plain" | "striped") => void;
}) {
	const ids = SELECT_ROWS.map((r) => r.id);
	const sel = useTableSelection(ids);
	const selectedCount = sel.selectedKeys.size;

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
					Selection + Density + Striped Variants
				</h4>
				<div className="flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border">
						{(["compact", "default", "comfortable"] as const).map((d) => (
							<button
								key={d}
								type="button"
								onClick={() => setDensity(d)}
								className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
									density === d
										? "bg-background text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{d}
							</button>
						))}
					</div>
					<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border">
						{(["plain", "striped"] as const).map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => setRowStyle(s)}
								className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
									rowStyle === s
										? "bg-background text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{s}
							</button>
						))}
					</div>
					<motion.span
						key={selectedCount}
						initial={{ scale: 0.8, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ type: "spring", stiffness: 500, damping: 30 }}
						className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-mono font-semibold border border-primary/30"
					>
						{selectedCount} selected
					</motion.span>
				</div>
			</div>
			<div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-xs">
				<MotionTable density={density} rowStyle={rowStyle}>
					<TableHeader className="bg-muted/40">
						<MotionTableRow interactive={false}>
							<MotionTableHead className="w-12">
								<MotionCheckbox
									size="sm"
									checked={sel.isAllSelected}
									indeterminate={sel.isIndeterminate}
									onCheckedChange={sel.toggleAll}
								/>
							</MotionTableHead>
							<MotionTableHead>Name</MotionTableHead>
							<MotionTableHead>Role</MotionTableHead>
							<MotionTableHead>Status</MotionTableHead>
						</MotionTableRow>
					</TableHeader>
					<TableBody>
						{SELECT_ROWS.map((row, idx) => (
							<MotionTableRow
								key={row.id}
								index={idx}
								selected={sel.selectedKeys.has(row.id)}
								onClick={() => sel.toggleRow(row.id)}
							>
								<MotionTableCell className="w-12">
									<MotionCheckbox
										size="sm"
										checked={sel.selectedKeys.has(row.id)}
										onCheckedChange={() => sel.toggleRow(row.id)}
									/>
								</MotionTableCell>
								<MotionTableCell className="font-semibold text-foreground">
									{row.name}
								</MotionTableCell>
								<MotionTableCell className="text-xs font-mono">{row.role}</MotionTableCell>
								<MotionTableCell>
									<span
										className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
											row.status === "Active"
												? "bg-emerald-500/10 text-emerald-400"
												: "bg-zinc-500/10 text-muted-foreground"
										}`}
									>
										<span className="size-1.5 rounded-full bg-current" />
										{row.status}
									</span>
								</MotionTableCell>
							</MotionTableRow>
						))}
					</TableBody>
				</MotionTable>
			</div>
		</div>
	);
}

const EXPAND_TASKS = [
	{
		id: "t1",
		title: "Design system audit",
		status: "In progress",
		detail:
			"Review all tokens, motion presets, and component APIs across web and mobile. Deliver a gap report.",
		tags: ["design", "audit"],
	},
	{
		id: "t2",
		title: "Table component demo",
		status: "Completed",
		detail:
			"Add sorting, selection, expandable rows, live updates, skeleton and empty states to the showcase.",
		tags: ["ui", "motion"],
	},
	{
		id: "t3",
		title: "RN parity",
		status: "Planned",
		detail: "Port the Motion Table feature set to React Native with Reanimated and NativeWind.",
		tags: ["mobile", "expo"],
	},
];

function TableExpandDemo({
	expandedTask,
	setExpandedTask,
}: {
	expandedTask: string | null;
	setExpandedTask: (v: string | null) => void;
}) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
					Expandable Rows (Spring Detail)
				</h4>
				<span className="text-xs font-mono text-muted-foreground">click a row to expand</span>
			</div>
			<div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-xs">
				<MotionTable>
					<TableHeader className="bg-muted/40">
						<MotionTableRow interactive={false}>
							<TableHead className="w-10" />
							<TableHead>Task</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Tags</TableHead>
						</MotionTableRow>
					</TableHeader>
					<TableBody>
						{EXPAND_TASKS.map((task, idx) => (
							<MotionTableExpandableRow
								key={task.id}
								rowIndex={idx}
								expanded={expandedTask === task.id}
								onExpand={(next) => setExpandedTask(next ? task.id : null)}
								colSpan={3}
								detail={
									<div className="py-3">
										<p className="text-sm text-muted-foreground leading-relaxed">{task.detail}</p>
										<div className="mt-2 flex items-center gap-2">
											<span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
												Tags:
											</span>
											{task.tags.map((t) => (
												<span
													key={t}
													className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-mono text-foreground"
												>
													{t}
												</span>
											))}
										</div>
									</div>
								}
							>
								<TableCell className="font-semibold text-foreground">{task.title}</TableCell>
								<TableCell>
									<span
										className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
											task.status === "Completed"
												? "bg-emerald-500/10 text-emerald-400"
												: task.status === "In progress"
													? "bg-indigo-500/10 text-indigo-400"
													: "bg-zinc-500/10 text-muted-foreground"
										}`}
									>
										<span className="size-1.5 rounded-full bg-current" />
										{task.status}
									</span>
								</TableCell>
								<TableCell>
									<span className="text-xs font-mono text-muted-foreground">
										{task.tags.join(" · ")}
									</span>
								</TableCell>
							</MotionTableExpandableRow>
						))}
					</TableBody>
				</MotionTable>
			</div>
		</div>
	);
}

const LIVE_NAMES = [
	"Elena Rostova",
	"Marcus Chen",
	"Sophia Martinez",
	"Liam O'Connor",
	"Aisha Khan",
	"Noah Patel",
];

function TableLiveDemo({
	liveRows,
	setLiveRows,
}: {
	liveRows: { id: string; name: string; status: string }[];
	setLiveRows: React.Dispatch<React.SetStateAction<{ id: string; name: string; status: string }[]>>;
}) {
	const addRow = () => {
		const name = LIVE_NAMES[liveRows.length % LIVE_NAMES.length];
		setLiveRows((prev) => [
			{ id: `live-${Date.now()}`, name: `${name} ${prev.length + 1}`, status: "Queued" },
			...prev,
		]);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
					Live Queue (AnimatePresence Add / Remove)
				</h4>
				<motion.button
					type="button"
					onClick={addRow}
					whileTap={{ scale: 0.92 }}
					className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
				>
					<HugeiconsIcon icon={Add01Icon} size={14} />
					Add Row
				</motion.button>
			</div>
			<div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-xs">
				<MotionTable>
					<TableHeader className="bg-muted/40">
						<MotionTableRow interactive={false}>
							<TableHead className="w-12 text-center">#</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-end">Action</TableHead>
						</MotionTableRow>
					</TableHeader>
					<TableBody>
						<AnimatePresence initial={false}>
							{liveRows.map((row, idx) => (
								<MotionTableRow key={row.id} index={idx}>
									<TableCell className="text-center font-mono text-xs text-muted-foreground">
										{idx + 1}
									</TableCell>
									<TableCell className="font-semibold text-foreground">{row.name}</TableCell>
									<TableCell>
										<span
											className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
												row.status === "Completed"
													? "bg-emerald-500/10 text-emerald-400"
													: row.status === "Processing"
														? "bg-indigo-500/10 text-indigo-400"
														: "bg-amber-500/10 text-amber-400"
											}`}
										>
											{row.status === "Processing" && (
												<HugeiconsIcon icon={Loading01Icon} size={12} className="animate-spin" />
											)}
											{row.status === "Queued" && (
												<span className="size-1.5 rounded-full bg-current" />
											)}
											{row.status}
										</span>
									</TableCell>
									<TableCell className="text-end">
										<motion.button
											type="button"
											whileTap={{ scale: 0.85 }}
											onClick={() => setLiveRows((prev) => prev.filter((r) => r.id !== row.id))}
											className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
											aria-label={`Remove ${row.name}`}
										>
											<HugeiconsIcon icon={Delete02Icon} size={14} />
										</motion.button>
									</TableCell>
								</MotionTableRow>
							))}
						</AnimatePresence>
					</TableBody>
				</MotionTable>
			</div>
		</div>
	);
}

function TableSkeletonDemo() {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
					Loading Skeleton
				</h4>
				<span className="text-xs font-mono text-muted-foreground">MotionTableSkeleton</span>
			</div>
			<div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-xs">
				<MotionTable>
					<TableHeader className="bg-muted/40">
						<MotionTableRow interactive={false}>
							<TableHead>Student Name</TableHead>
							<TableHead>Grade</TableHead>
							<TableHead>Attendance</TableHead>
							<TableHead className="text-end">GPA</TableHead>
						</MotionTableRow>
					</TableHeader>
					<MotionTableSkeleton rows={4} columns={4} />
				</MotionTable>
			</div>
		</div>
	);
}

function TableEmptyDemo({
	emptyRows,
	setEmptyRows,
}: {
	emptyRows: { id: string; name: string; grade: string }[];
	setEmptyRows: React.Dispatch<React.SetStateAction<{ id: string; name: string; grade: string }[]>>;
}) {
	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
					Empty State
				</h4>
				<span className="text-xs font-mono text-muted-foreground">TableEmptyState</span>
			</div>
			<div className="rounded-2xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-xs">
				<MotionTable>
					<TableHeader className="bg-muted/40">
						<MotionTableRow interactive={false}>
							<TableHead className="w-12 text-center">#</TableHead>
							<TableHead>Student Name</TableHead>
							<TableHead>Grade</TableHead>
							<TableHead className="text-end">Action</TableHead>
						</MotionTableRow>
					</TableHeader>
					<TableBody>
						{emptyRows.length === 0 ? (
							<TableEmptyState
								colSpan={4}
								message="No students in the roster"
								description="Add a student to start populating the table — the row will spring in."
								icon={<HugeiconsIcon icon={InboxIcon} size={22} />}
								action={
									<motion.button
										type="button"
										whileTap={{ scale: 0.94 }}
										onClick={() =>
											setEmptyRows([
												{ id: "e1", name: "Alex Rivera", grade: "Grade 10" },
												{ id: "e2", name: "Priya Sharma", grade: "Grade 11" },
											])
										}
										className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110 transition-all"
									>
										<HugeiconsIcon icon={Add01Icon} size={14} />
										Add first student
									</motion.button>
								}
							/>
						) : (
							<AnimatePresence initial={false}>
								{emptyRows.map((row, idx) => (
									<MotionTableRow key={row.id} index={idx}>
										<TableCell className="text-center font-mono text-xs text-muted-foreground">
											{idx + 1}
										</TableCell>
										<TableCell className="font-semibold text-foreground">{row.name}</TableCell>
										<TableCell className="text-xs font-mono">{row.grade}</TableCell>
										<TableCell className="text-end">
											<motion.button
												type="button"
												whileTap={{ scale: 0.85 }}
												onClick={() => setEmptyRows((prev) => prev.filter((r) => r.id !== row.id))}
												className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
												aria-label={`Remove ${row.name}`}
											>
												<HugeiconsIcon icon={Delete02Icon} size={14} />
											</motion.button>
										</TableCell>
									</MotionTableRow>
								))}
							</AnimatePresence>
						)}
					</TableBody>
				</MotionTable>
			</div>
		</div>
	);
}

export default function ComponentPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = use(params);
	const { resolvedTheme } = useTheme();

	const [activeViewTab, setActiveViewTab] = useState<"preview" | "code">("preview");
	const [copied, setCopied] = useState(false);
	const [cmdCopied, setCmdCopied] = useState(false);

	const [bottomBarTab, setBottomBarTab] = useState("home");
	const [typesetPreset, setTypesetPreset] = useState<TypesetPreset>("docs");

	const [manualThemeMode, setManualThemeMode] = useState<"dark" | "light" | null>(null);
	const activeTheme = manualThemeMode ?? (resolvedTheme === "light" ? "light" : "dark");

	// AAVE GLASS OPTICAL LENS SLIDERS
	const [lensWidth, setLensWidth] = useState(71);
	const [lensHeight, setLensHeight] = useState(80);
	const [borderRadius, setBorderRadius] = useState(64);
	const [scale, setScale] = useState(0.2);
	const [depth, setDepth] = useState(52);
	const [curvature, setCurvature] = useState(80);
	const [splay, setSplay] = useState(1.0);
	const [chroma, setChroma] = useState(0.98);
	const [blur, setBlur] = useState(2.0);
	const [glow, setGlow] = useState(1.0);
	const [edgeHighlight, setEdgeHighlight] = useState(0.25);
	const [specularAngle, setSpecularAngle] = useState(180);

	// FLUID LIQUID SWITCHING PHYSICS SLIDERS
	const [switchScaleX, setSwitchScaleX] = useState(1.22);
	const [switchScaleY, setSwitchScaleY] = useState(1.42);
	const [stiffness, setStiffness] = useState(220);
	const [damping, setDamping] = useState(14);
	const [mass, setMass] = useState(0.8);

	// ── MOTION TABLE DEMO STATE ───────────────────────────────────────
	const [tableCodeKey, setTableCodeKey] = useState<
		"sort" | "select" | "expand" | "live" | "skeleton" | "empty"
	>("sort");
	const [tableDensity, setTableDensity] = useState<"compact" | "default" | "comfortable">(
		"default",
	);
	const [tableRowStyle, setTableRowStyle] = useState<"plain" | "striped">("plain");
	const [expandedTask, setExpandedTask] = useState<string | null>(null);
	const [liveRows, setLiveRows] = useState<{ id: string; name: string; status: string }[]>([
		{ id: "l1", name: "Elena Rostova", status: "Queued" },
		{ id: "l2", name: "Marcus Chen", status: "Processing" },
		{ id: "l3", name: "Sophia Martinez", status: "Completed" },
	]);
	const [emptyRows, setEmptyRows] = useState<{ id: string; name: string; grade: string }[]>([]);
	const [tablePage, setTablePage] = useState(1);
	const TABLE_PAGE_SIZE = 4;

	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	// LIVE RENDERING OF THE RGB NORMAL DISPLACEMENT MAP ON RIGHT VIEWPORT
	useEffect(() => {
		if (slug !== "bottom-bar" || !canvasRef.current) return;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const w = Math.max(64, Math.round(lensWidth * 2));
		const h = Math.max(64, Math.round(lensHeight * 2));
		canvas.width = w;
		canvas.height = h;

		const imgData = ctx.createImageData(w, h);
		const data = imgData.data;

		const cx = w / 2;
		const cy = h / 2;
		const curv = Math.max(0.2, curvature / 40);
		const dep = depth / 50;

		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const idx = (y * w + x) * 4;

				const dx = (x - cx) / cx;
				const dy = (y - cy) / cy;
				const dist = Math.sqrt(dx * dx + dy * dy);

				if (dist <= 1) {
					const factor = dist ** curv * dep;
					const normX = Math.min(1, Math.max(-1, dx * factor * splay));
					const normY = Math.min(1, Math.max(-1, dy * factor * splay));

					data[idx] = Math.round(128 + normX * 127);
					data[idx + 1] = Math.round(128 + normY * 127);
					data[idx + 2] = Math.round(255 * (1 - dist * 0.4) * Math.min(1.5, glow));
					data[idx + 3] = 255;
				} else {
					data[idx] = activeTheme === "light" ? 220 : 113;
					data[idx + 1] = activeTheme === "light" ? 220 : 113;
					data[idx + 2] = activeTheme === "light" ? 230 : 122;
					data[idx + 3] = 255;
				}
			}
		}

		ctx.putImageData(imgData, 0, 0);
	}, [slug, lensWidth, lensHeight, borderRadius, depth, curvature, splay, glow, activeTheme]);

	const codeSnippet =
		slug === "table"
			? tableCodeKey === "sort"
				? WEB_TABLE_SORT_CODE
				: tableCodeKey === "select"
					? WEB_TABLE_SELECT_CODE
					: tableCodeKey === "expand"
						? WEB_TABLE_EXPAND_CODE
						: tableCodeKey === "live"
							? WEB_TABLE_LIVE_CODE
							: tableCodeKey === "skeleton"
								? WEB_TABLE_SKELETON_CODE
								: WEB_TABLE_EMPTY_CODE
			: slug === "accordion"
				? WEB_ACCORDION_CODE
				: slug === "checkbox"
					? WEB_CHECKBOX_CODE
					: slug === "slider"
						? WEB_SLIDER_CODE
						: slug === "switch"
							? WEB_SWITCH_CODE
							: slug === "glass-card"
								? WEB_GLASS_CARD_CODE
								: slug === "bottom-bar"
									? WEB_BOTTOM_BAR_CODE
									: slug === "select"
										? WEB_SELECT_CODE
										: slug === "input"
											? WEB_INPUT_CODE
											: slug === "button"
												? WEB_BUTTON_CODE
												: slug === "typeset"
													? WEB_TYPESET_CODE
													: WEB_TABS_CODE;

	const handleCopy = () => {
		navigator.clipboard.writeText(codeSnippet);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const copyInstall = () => {
		navigator.clipboard.writeText("bun add @grid/ui");
		setCmdCopied(true);
		setTimeout(() => setCmdCopied(false), 2000);
	};

	const title =
		slug === "table"
			? "Motion Table"
			: slug === "accordion"
				? "Motion Accordion"
				: slug === "checkbox"
					? "Motion Checkbox"
					: slug === "slider"
						? "Motion Slider"
						: slug === "switch"
							? "Motion Switch"
							: slug === "glass-card"
								? "Liquid Glass Card"
								: slug === "bottom-bar"
									? "Liquid Glass Bottom Bar"
									: slug === "typeset"
										? "Typeset"
										: slug === "select"
											? "Motion Select"
											: slug === "input"
												? "Motion Input"
												: slug === "button"
													? "Motion Button"
													: "Motion Tabs";

	const description =
		slug === "table"
			? "Interactive data table with sortable columns, row selection, expandable rows, live updates, loading skeletons, empty states & density variants"
			: slug === "accordion"
				? "Bouncy spring-height animated accordion with rotating chevrons, layout variants, & single/multi selection"
				: slug === "checkbox"
					? "Spring-animated checkbox with path draw checkmarks, indeterminate dash states, & color variants"
					: slug === "slider"
						? "Tactile spring range slider with floating value tooltip badge, step ticks, and color variants"
						: slug === "switch"
							? "Spring-animated toggle switch with thumb icon swap, async loading state, and color variants"
							: slug === "glass-card"
								? "Tactile glass surface container with SVG feDisplacementMap light refraction, chromatic aberration, & 3D tilt hover"
								: slug === "bottom-bar"
									? "Official Aave Glass Lens Generator & Fluid Dynamics Studio"
									: slug === "typeset"
										? "A styling system for HTML and rendered markdown with 3 rhythm controls: size, leading, and flow."
										: slug === "select"
											? "Animated combobox dropdown with search filtering, spring scale physics, and keyboard navigation."
											: slug === "input"
												? "Interactive input field with focus ring animations, error shake, and password toggling."
												: slug === "button"
													? "Spring interactive button with multi-state loading, success, and error feedback."
													: "Spring animated layout indicator with exclusion pill and underline tab variants.";

	return (
		<div className="space-y-8 max-w-5xl pb-16">
			{/* HEADER */}
			<div className="space-y-2 border-b border-border pb-6">
				<div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
					<span>Components</span>
					<span>/</span>
					<span className="text-foreground font-semibold">{slug}</span>
					<Badge
						variant="outline"
						className="ml-2 font-mono text-[10px] text-teal-400 border-teal-500/30"
					>
						Ready
					</Badge>
				</div>
				<h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
				<p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{description}</p>
			</div>

			{/* PREVIEW CONTAINER */}
			<section className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border">
						<button
							type="button"
							onClick={() => setActiveViewTab("preview")}
							className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
								activeViewTab === "preview"
									? "bg-background text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={2} />
							Preview
						</button>
						<button
							type="button"
							onClick={() => setActiveViewTab("code")}
							className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
								activeViewTab === "code"
									? "bg-background text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<HugeiconsIcon icon={CodeIcon} size={14} strokeWidth={2} />
							Code
						</button>
					</div>

					{/* GLOBAL THEME SYNC STATUS / MANUAL OVERRIDE */}
					{slug === "bottom-bar" && (
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border">
								<button
									type="button"
									onClick={() => setManualThemeMode("dark")}
									className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
										activeTheme === "dark"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<HugeiconsIcon icon={Moon01Icon} size={12} />
									Dark
								</button>
								<button
									type="button"
									onClick={() => setManualThemeMode("light")}
									className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
										activeTheme === "light"
											? "bg-background text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<HugeiconsIcon icon={Sun01Icon} size={12} />
									Light
								</button>
							</div>
						</div>
					)}
				</div>

				<Card className="border border-border bg-card overflow-hidden">
					<CardContent className="p-0">
						{activeViewTab === "preview" && (
							<div
								className={`p-6 space-y-6 transition-colors duration-300 ${activeTheme === "light" ? "bg-zinc-100" : "bg-[#09090b]"}`}
							>
								{slug === "table" ? (
									<div className="space-y-12 py-6 px-4">
										{/* ── SUB-TAB PICKER: which table demo to preview ─────────────── */}
										<div className="flex flex-wrap items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border w-fit">
											{(
												[
													["sort", "Sort"],
													["select", "Select"],
													["expand", "Expand"],
													["live", "Live"],
													["skeleton", "Skeleton"],
													["empty", "Empty"],
												] as const
											).map(([key, label]) => (
												<button
													key={key}
													type="button"
													onClick={() => {
														setTableCodeKey(key);
														if (key === "empty") setEmptyRows([]);
													}}
													className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
														tableCodeKey === key
															? "bg-background text-foreground shadow-xs"
															: "text-muted-foreground hover:text-foreground"
													}`}
												>
													{label}
												</button>
											))}
										</div>

										{/* ── SORT DEMO ─────────────────────────────────────────────── */}
										{tableCodeKey === "sort" && (
											<TableSortDemo
												page={tablePage}
												onPageChange={setTablePage}
												pageSize={TABLE_PAGE_SIZE}
											/>
										)}

										{/* ── SELECT DEMO ───────────────────────────────────────────── */}
										{tableCodeKey === "select" && (
											<TableSelectDemo
												density={tableDensity}
												rowStyle={tableRowStyle}
												setDensity={setTableDensity}
												setRowStyle={setTableRowStyle}
											/>
										)}

										{/* ── EXPAND DEMO ──────────────────────────────────────────── */}
										{tableCodeKey === "expand" && (
											<TableExpandDemo
												expandedTask={expandedTask}
												setExpandedTask={setExpandedTask}
											/>
										)}

										{/* ── LIVE DEMO ────────────────────────────────────────────── */}
										{tableCodeKey === "live" && (
											<TableLiveDemo liveRows={liveRows} setLiveRows={setLiveRows} />
										)}

										{/* ── SKELETON DEMO ────────────────────────────────────────── */}
										{tableCodeKey === "skeleton" && <TableSkeletonDemo />}

										{/* ── EMPTY DEMO ───────────────────────────────────────────── */}
										{tableCodeKey === "empty" && (
											<TableEmptyDemo emptyRows={emptyRows} setEmptyRows={setEmptyRows} />
										)}
									</div>
								) : slug === "accordion" ? (
									<div className="flex flex-col items-center justify-center py-12 px-6 max-w-xl mx-auto space-y-10">
										<div className="space-y-3 text-center w-full">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Contained Cards Variant
											</h4>
											<MotionAccordion
												variant="contained"
												defaultValue={["item-1"]}
												className="w-full"
											>
												<AccordionItem value="item-1">
													<AccordionTrigger>What is Motion Accordion?</AccordionTrigger>
													<AccordionContent>
														A spring-height animated accordion component with smooth layout
														measurement, rotating chevrons, & zero layout jitter.
													</AccordionContent>
												</AccordionItem>
												<AccordionItem value="item-2">
													<AccordionTrigger>How are physics configured?</AccordionTrigger>
													<AccordionContent>
														Height transitions use Framer Motion spring physics with reduced motion
														fallbacks for accessibility.
													</AccordionContent>
												</AccordionItem>
											</MotionAccordion>
										</div>

										<div className="space-y-3 text-center w-full">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Default Bordered Divider Variant
											</h4>
											<MotionAccordion
												variant="default"
												defaultValue={["item-a"]}
												className="w-full"
											>
												<AccordionItem value="item-a">
													<AccordionTrigger>Is it fully accessible?</AccordionTrigger>
													<AccordionContent>
														Yes, built on Base UI Accordion primitive with complete ARIA keyboard
														navigation.
													</AccordionContent>
												</AccordionItem>
												<AccordionItem value="item-b">
													<AccordionTrigger>Can I expand multiple items?</AccordionTrigger>
													<AccordionContent>
														Simply set <code>type="multiple"</code> on the Root component.
													</AccordionContent>
												</AccordionItem>
											</MotionAccordion>
										</div>
									</div>
								) : slug === "checkbox" ? (
									<div className="flex flex-col items-center justify-center py-12 px-6 space-y-10">
										<div className="space-y-3 text-center">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Sizes & Color Variants
											</h4>
											<div className="flex flex-wrap items-center justify-center gap-8 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<div className="flex items-center gap-3">
													<MotionCheckbox defaultChecked size="sm" variant="default" />
													<span className="text-xs font-mono text-muted-foreground">Small</span>
												</div>
												<div className="flex items-center gap-3">
													<MotionCheckbox defaultChecked size="default" variant="indigo" />
													<span className="text-xs font-mono text-muted-foreground">
														Default (Indigo)
													</span>
												</div>
												<div className="flex items-center gap-3">
													<MotionCheckbox defaultChecked size="lg" variant="emerald" />
													<span className="text-xs font-mono text-muted-foreground">
														Large (Emerald)
													</span>
												</div>
											</div>
										</div>

										<div className="space-y-3 text-center">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Indeterminate & Async Stateful Checkbox
											</h4>
											<div className="flex flex-wrap items-center justify-center gap-8 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<div className="flex items-center gap-3">
													<MotionCheckbox indeterminate size="default" variant="default" />
													<span className="text-xs font-mono text-muted-foreground">
														Indeterminate State
													</span>
												</div>
												<div className="flex items-center gap-3">
													<StatefulCheckbox
														size="lg"
														variant="destructive"
														onToggle={async (next) => {
															await new Promise((res) => setTimeout(res, 1200));
															return true;
														}}
													/>
													<span className="text-xs font-mono text-muted-foreground">
														Async Stateful (1.2s delay)
													</span>
												</div>
											</div>
										</div>
									</div>
								) : slug === "slider" ? (
									<div className="flex flex-col items-center justify-center py-12 px-6 max-w-lg mx-auto space-y-10">
										<div className="space-y-2 text-center w-full">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Single Value Slider (With Step Ticks & Floating Tooltip)
											</h4>
											<div className="p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<MotionSlider defaultValue={[45]} variant="default" showTicks step={10} />
											</div>
										</div>

										<div className="space-y-2 text-center w-full">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Custom Formatted Value Badge
											</h4>
											<div className="p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<MotionSlider
													defaultValue={[72]}
													variant="indigo"
													formatValue={(v) => `${v}% Volume`}
												/>
											</div>
										</div>

										<div className="space-y-2 text-center w-full">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Dual Range Slider
											</h4>
											<div className="p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<MotionSlider defaultValue={[20, 80]} variant="emerald" />
											</div>
										</div>
									</div>
								) : slug === "switch" ? (
									<div className="flex flex-col items-center justify-center py-12 px-6 space-y-10">
										<div className="space-y-3 text-center">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Sizes & Color Variants
											</h4>
											<div className="flex flex-wrap items-center justify-center gap-8 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<div className="flex items-center gap-3">
													<MotionSwitch defaultChecked size="sm" variant="default" />
													<span className="text-xs font-mono text-muted-foreground">
														Small (Default)
													</span>
												</div>
												<div className="flex items-center gap-3">
													<MotionSwitch defaultChecked size="default" variant="success" />
													<span className="text-xs font-mono text-muted-foreground">
														Default (Success)
													</span>
												</div>
												<div className="flex items-center gap-3">
													<MotionSwitch defaultChecked size="lg" variant="indigo" />
													<span className="text-xs font-mono text-muted-foreground">
														Large (Indigo)
													</span>
												</div>
											</div>
										</div>

										<div className="space-y-3 text-center">
											<h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
												Async Stateful Switch (1.2s Toggle Delay)
											</h4>
											<div className="flex items-center justify-center gap-4 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-md">
												<StatefulSwitch
													size="lg"
													variant="destructive"
													onToggle={async (next) => {
														await new Promise((res) => setTimeout(res, 1200));
														return true;
													}}
												/>
												<span className="text-xs font-mono text-muted-foreground">
													Click to test loading state & spring swap
												</span>
											</div>
										</div>
									</div>
								) : slug === "glass-card" ? (
									<div className="flex flex-col items-center justify-center py-12 px-4 space-y-6">
										<GlassCard
											themeMode={activeTheme}
											depth={depth}
											curvature={curvature}
											splay={splay}
											chroma={chroma}
											blur={blur}
											glow={glow}
											edgeHighlight={edgeHighlight}
											specularAngle={specularAngle}
											className="max-w-md w-full"
										>
											<GlassCardHeader>
												<div className="flex items-center justify-between">
													<GlassCardBadge>Aave Lens Engine</GlassCardBadge>
													<span className="text-xs font-mono text-muted-foreground">v2.4</span>
												</div>
												<GlassCardTitle className="pt-2">Liquid Glass Card Surface</GlassCardTitle>
												<GlassCardDescription>
													Interactive glass surface refracting real live DOM elements with
													multi-channel RGB chromatic dispersion.
												</GlassCardDescription>
											</GlassCardHeader>
											<GlassCardContent className="space-y-3">
												<div className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs font-mono">
													<span>Refraction Scale</span>
													<span className="text-teal-400 font-bold">
														{(scale * 160).toFixed(1)}px
													</span>
												</div>
												<div className="flex items-center justify-between p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs font-mono">
													<span>Chromatic Fringe</span>
													<span className="text-purple-400 font-bold">
														{(chroma * 100).toFixed(0)}%
													</span>
												</div>
											</GlassCardContent>
											<GlassCardFooter>
												<button
													type="button"
													className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-indigo-500 text-black font-semibold text-xs shadow-lg hover:brightness-110 transition-all"
												>
													Interactive Tilt Lens
												</button>
												<span className="text-[11px] font-mono text-muted-foreground">
													Hover to swell
												</span>
											</GlassCardFooter>
										</GlassCard>
									</div>
								) : slug === "bottom-bar" ? (
									<>
										{/* DUAL VIEWPORTS MATCHING SCREENSHOT */}
										<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
											{/* LEFT VIEWPORT: REFRACTED RESULT OVER GRID */}
											<div
												className={`h-64 rounded-3xl overflow-hidden relative border flex items-center justify-center p-4 ${
													activeTheme === "light"
														? "border-black/10 bg-gradient-to-br from-indigo-100/80 via-zinc-100 to-purple-100/80"
														: "border-white/10 bg-gradient-to-br from-indigo-950/60 via-zinc-950 to-purple-950/60"
												}`}
											>
												<div
													className="absolute inset-0 bg-cover bg-center opacity-80"
													style={{
														backgroundImage:
															'url("/home/shabir/.gemini/antigravity-cli/brain/862b382b-0ea2-4445-b312-852049313c8d/glass_background_1785059083234.jpg")',
													}}
												/>
												<div
													className={`absolute inset-0 bg-[size:32px_32px] ${
														activeTheme === "light"
															? "bg-[linear-gradient(to_right,rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.06)_1px,transparent_1px)]"
															: "bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)]"
													}`}
												/>

												<BottomBar
													themeMode={activeTheme}
													value={bottomBarTab}
													onValueChange={setBottomBarTab}
													width={lensWidth}
													height={lensHeight}
													borderRadius={borderRadius}
													scale={scale}
													depth={depth}
													curvature={curvature}
													splay={splay}
													chroma={chroma}
													blur={blur}
													glow={glow}
													edgeHighlight={edgeHighlight}
													specularAngle={specularAngle}
													switchScaleX={switchScaleX}
													switchScaleY={switchScaleY}
													stiffness={stiffness}
													damping={damping}
													mass={mass}
													className="relative z-10"
												>
													<BottomBarItem
														value="home"
														icon={<HugeiconsIcon icon={Home01Icon} size={16} />}
													>
														Home
													</BottomBarItem>
													<BottomBarItem
														value="explore"
														icon={<HugeiconsIcon icon={Search01Icon} size={16} />}
													>
														Explore
													</BottomBarItem>
													<BottomBarItem
														value="profile"
														icon={<HugeiconsIcon icon={UserIcon} size={16} />}
													>
														Profile
													</BottomBarItem>
												</BottomBar>
											</div>

											{/* RIGHT VIEWPORT: LIVE DYNAMIC CANVAS RGB NORMAL DISPLACEMENT MAP */}
											<div
												className={`h-64 rounded-3xl overflow-hidden relative border flex items-center justify-center p-4 ${
													activeTheme === "light"
														? "border-black/10 bg-zinc-200"
														: "border-white/10 bg-[#71717a]"
												}`}
											>
												<canvas
													ref={canvasRef}
													className="rounded-[32px] shadow-2xl transition-all duration-300 max-w-[200px] max-h-[160px] object-contain"
												/>
											</div>
										</div>

										<p
											className={`text-center text-xs font-medium ${activeTheme === "light" ? "text-zinc-600" : "text-zinc-400"}`}
										>
											On the left is the refracted result, on the right the map that drives it.
											(Click tabs to test fluid swell)
										</p>
									</>
								) : (
									<div className="min-h-[300px] flex items-center justify-center">
										<Typeset preset={typesetPreset}>
											<h1>Typeset System</h1>
										</Typeset>
									</div>
								)}
							</div>
						)}

						{activeViewTab === "code" && (
							<div className="relative bg-zinc-950 text-zinc-100 p-6 font-mono text-xs overflow-x-auto min-h-[300px]">
								<Button
									variant="ghost"
									size="sm"
									onClick={handleCopy}
									className="absolute right-4 top-4 h-8 px-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 gap-1.5 border border-zinc-700"
								>
									<HugeiconsIcon
										icon={copied ? Tick02Icon : Copy01Icon}
										size={14}
										className={copied ? "text-emerald-400" : ""}
									/>
									{copied ? "Copied!" : "Copy Code"}
								</Button>
								<pre className="pr-16 leading-relaxed">
									<code>{codeSnippet}</code>
								</pre>
							</div>
						)}
					</CardContent>
				</Card>
			</section>

			{/* FLUID LIQUID SWITCHING PHYSICS CONTROLS */}
			{slug === "bottom-bar" && (
				<section className="space-y-4">
					<div className="flex items-center gap-2">
						<HugeiconsIcon icon={SparklesIcon} size={18} className="text-purple-400" />
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							Fluid Liquid Switching Physics Controls
						</h2>
					</div>
					<Card
						className={`border p-6 rounded-3xl transition-colors duration-300 ${
							activeTheme === "light" ? "border-border bg-card" : "border-white/10 bg-[#0c0c0e]/95"
						}`}
					>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
							{/* LEFT COLUMN */}
							<div className="space-y-5">
								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">
										Switch Scale X (Horizontal Stretch)
									</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="1.00"
											max="1.80"
											step="0.02"
											value={switchScaleX}
											onChange={(e) => setSwitchScaleX(Number.parseFloat(e.target.value))}
											className="w-full accent-purple-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{switchScaleX.toFixed(2)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">
										Switch Scale Y (Vertical Swell)
									</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="1.00"
											max="2.00"
											step="0.02"
											value={switchScaleY}
											onChange={(e) => setSwitchScaleY(Number.parseFloat(e.target.value))}
											className="w-full accent-purple-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{switchScaleY.toFixed(2)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Spring Stiffness</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="50"
											max="500"
											step="10"
											value={stiffness}
											onChange={(e) => setStiffness(Number.parseInt(e.target.value))}
											className="w-full accent-purple-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{stiffness}
										</span>
									</div>
								</div>
							</div>

							{/* RIGHT COLUMN */}
							<div className="space-y-5">
								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">
										Spring Damping (Friction)
									</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="5"
											max="40"
											step="1"
											value={damping}
											onChange={(e) => setDamping(Number.parseInt(e.target.value))}
											className="w-full accent-purple-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{damping}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Droplet Mass</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.2"
											max="3.0"
											step="0.1"
											value={mass}
											onChange={(e) => setMass(Number.parseFloat(e.target.value))}
											className="w-full accent-purple-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{mass.toFixed(1)}
										</span>
									</div>
								</div>
							</div>
						</div>
					</Card>
				</section>
			)}

			{/* EXACT 12 AAVE GLASS SLIDERS MATCHING SCREENSHOT */}
			{slug === "bottom-bar" && (
				<section className="space-y-4">
					<div className="flex items-center gap-2">
						<HugeiconsIcon icon={CubeIcon} size={18} className="text-indigo-400" />
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							Optical Lens Displacement Controls
						</h2>
					</div>
					<Card
						className={`border p-6 rounded-3xl transition-colors duration-300 ${
							activeTheme === "light" ? "border-border bg-card" : "border-white/10 bg-[#0c0c0e]/95"
						}`}
					>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
							{/* LEFT COLUMN */}
							<div className="space-y-5">
								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Width</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="40"
											max="160"
											value={lensWidth}
											onChange={(e) => setLensWidth(Number.parseInt(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{lensWidth}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">BorderRadius</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0"
											max="80"
											value={borderRadius}
											onChange={(e) => setBorderRadius(Number.parseInt(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{borderRadius}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Depth</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="10"
											max="90"
											value={depth}
											onChange={(e) => setDepth(Number.parseInt(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{depth}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Splay</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.1"
											max="2.0"
											step="0.05"
											value={splay}
											onChange={(e) => setSplay(Number.parseFloat(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{splay.toFixed(2)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Blur</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.0"
											max="10.0"
											step="0.1"
											value={blur}
											onChange={(e) => setBlur(Number.parseFloat(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{blur.toFixed(1)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Edge Highlight</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.0"
											max="1.0"
											step="0.05"
											value={edgeHighlight}
											onChange={(e) => setEdgeHighlight(Number.parseFloat(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{edgeHighlight.toFixed(2)}
										</span>
									</div>
								</div>
							</div>

							{/* RIGHT COLUMN */}
							<div className="space-y-5">
								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Height</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="30"
											max="120"
											value={lensHeight}
											onChange={(e) => setLensHeight(Number.parseInt(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{lensHeight}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Scale</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.000"
											max="0.500"
											step="0.01"
											value={scale}
											onChange={(e) => setScale(Number.parseFloat(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{scale.toFixed(3)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Curvature</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0"
											max="100"
											value={curvature}
											onChange={(e) => setCurvature(Number.parseInt(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{curvature}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Chroma</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.00"
											max="2.00"
											step="0.02"
											value={chroma}
											onChange={(e) => setChroma(Number.parseFloat(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{chroma.toFixed(2)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Glow</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0.00"
											max="2.00"
											step="0.05"
											value={glow}
											onChange={(e) => setGlow(Number.parseFloat(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{glow.toFixed(2)}
										</span>
									</div>
								</div>

								<div className="flex items-center justify-between">
									<span className="text-xs font-semibold text-foreground">Specular Angle</span>
									<div className="flex items-center gap-4 flex-1 max-w-[200px] ml-auto">
										<input
											type="range"
											min="0"
											max="360"
											step="5"
											value={specularAngle}
											onChange={(e) => setSpecularAngle(Number.parseInt(e.target.value))}
											className="w-full accent-indigo-400 cursor-pointer"
										/>
										<span className="text-xs font-mono text-foreground w-10 text-right">
											{specularAngle}
										</span>
									</div>
								</div>
							</div>
						</div>
					</Card>
				</section>
			)}

			{/* INSTALLATION */}
			<section className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
					<HugeiconsIcon icon={Download01Icon} size={18} strokeWidth={2} />
					Installation
				</h2>
				<Card className="border border-border bg-card p-4">
					<div className="flex items-center justify-between font-mono text-xs bg-zinc-950 text-zinc-100 p-3 rounded-lg border border-zinc-800">
						<code>bun add @grid/ui</code>
						<Button
							variant="ghost"
							size="sm"
							onClick={copyInstall}
							className="h-7 px-2 text-xs bg-zinc-800 text-zinc-300 gap-1"
						>
							{cmdCopied ? "Copied" : "Copy"}
						</Button>
					</div>
				</Card>
			</section>
		</div>
	);
}
