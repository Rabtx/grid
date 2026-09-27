/**
 * Grid's design system. Screens are rebuilt on these; the older `@/ui` primitives go away as
 * each screen moves over. `/design` shows every piece in every state.
 */
export {
	AgentMark,
	Avatar,
	AvatarGroup,
	hueOf,
	type Provider,
	ProviderMark,
	WorkspaceMark,
	NobodyMark,
} from "./avatar";
export { Badge, Count, Kbd, type Tone } from "./badge";
export { BrandLogo, BrandMark } from "./brand";
export { Button, button, IconButton, iconButton, LinkButton } from "./button";
export {
	BoardColumn,
	BoardSkeleton,
	LaneStrip,
	TaskCard,
	TaskStatus,
	type TaskStatusKind,
	taskStatusLabel,
} from "./board";
export { ChoiceChips, RadioCards, type RadioOption, Slider } from "./choice";
export { ConfirmDialog, Dialog, PanelBar } from "./dialog";
export { PreviewFrame, RadiusScale, Specimen, SurfaceSwatches } from "./docs";
export { ActivityItem, DropZone, InlineAdd, SplitLayout, WorkspacePreview } from "./extras";
export {
	Alert,
	Banner,
	FloatingNotice,
	ProgressBar,
	Shimmer,
	Spinner,
	StatusDot,
	UsageBar,
	WorkingDots,
	LoadingBar,
} from "./feedback";
export { attachContextMenu, LONG_PRESS_MS, type MenuPoint } from "./context-menu";
export { AppFrame, AuthFrame } from "./frame";
export { Field, InlineInput, Input, SearchInput, Textarea, TitleInput } from "./field";
export * from "./icons";
export { Divider, Grid, Page, PageHeader, Row, Section, Spacer, Stack } from "./layout";
export { Breadcrumbs, type HeaderTab, HeaderTabs } from "./header";
export { Menu, MENU_ITEM, type MenuGroup, type MenuItem, MenuList, menuTrigger } from "./menu";
export {
	AgentMessage,
	Attachment,
	DiffCard,
	type DiffLine,
	DiffStat,
	Prose,
	UserMessage,
} from "./message";
export { NavButton, NavGroup, NavLink, NavNote, NavSection } from "./nav";
export { type AutocompleteItem, AutocompleteList, Palette, type PaletteItem } from "./palette";
export { type Placement, Popover, type PopoverControl } from "./popover";
export {
	MIC_BUTTON,
	PROMPT_ADD,
	PROMPT_CHIP,
	PROMPT_FIELD,
	PROMPT_ICON,
	PromptBox,
	SEND_BUTTON,
	STOP_BUTTON,
	Suggestions,
} from "./prompt-box";
export { Checklist, ChoicePrompt, DecisionCard, ProgressRing } from "./prompts";
export {
	CodeBlock,
	Disclosure,
	InlineNotice,
	type PlanEntry,
	PlanList,
	Pre,
	Rail,
	type RunStep,
	RunStatus,
	RunSteps,
	type StepStatus,
} from "./run";
export { Select, type SelectGroup, type SelectOption } from "./select";
export { CopyField, PropertyRow, SettingsGroup, SettingsRow } from "./settings";
export { Pagination, Stepper } from "./steps";
export { Card, DescriptionList, EmptyState, ListCard, Panel, Skeleton, Tooltip } from "./surface";
export { Checkbox, CheckboxField, Switch } from "./switch";
export { Table, Td, Th, Tr } from "./table";
export { Terminal, TermText } from "./terminal";
export { Segmented, type TabOption, Tabs } from "./tabs";
export { Heading, Text, type TextSize, type TextTone } from "./text";
export { notify, Toasts } from "./toast";
export { FilterChip, Toolbar, ToolbarButton } from "./toolbar";
export { FileTree, type TreeNode } from "./tree";
export { type VariantProps, variants } from "./variants";
