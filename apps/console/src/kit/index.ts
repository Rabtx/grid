/**
 * Grid's design system. Screens are rebuilt on these; the older `@/ui` primitives go away as
 * each screen moves over. `/design` shows every piece in every state.
 */
export { Avatar, AvatarGroup, hueOf, type Provider, ProviderMark, WorkspaceMark } from "./avatar";
export { Badge, Count, Kbd, type Tone } from "./badge";
export { Button, button, IconButton } from "./button";
export { BoardColumn, TaskCard, TaskStatus, type TaskStatusKind } from "./board";
export { RadioCards, type RadioOption, Slider } from "./choice";
export { ConfirmDialog, Dialog } from "./dialog";
export { PreviewFrame, RadiusScale, Specimen, SurfaceSwatches } from "./docs";
export { ActivityItem, DropZone, SplitLayout, WorkspacePreview } from "./extras";
export { Alert, Banner, ProgressBar, Spinner, StatusDot, UsageBar } from "./feedback";
export { Field, Input, SearchInput, Textarea } from "./field";
export * from "./icons";
export { Divider, Grid, Page, PageHeader, Row, Section, Spacer, Stack } from "./layout";
export { Breadcrumbs, type HeaderTab, HeaderTabs } from "./header";
export { Menu, MENU_ITEM, type MenuGroup, type MenuItem, MenuList, menuTrigger } from "./menu";
export { AgentMessage, Attachment, DiffCard, type DiffLine, UserMessage } from "./message";
export { NavButton, NavLink, NavSection } from "./nav";
export { Palette, type PaletteItem } from "./palette";
export { type Placement, Popover } from "./popover";
export {
	PROMPT_ADD,
	PROMPT_CHIP,
	PROMPT_FIELD,
	PROMPT_ICON,
	PromptBox,
	SEND_BUTTON,
	Suggestions,
} from "./prompt-box";
export { Checklist, ChoicePrompt, ProgressRing } from "./prompts";
export { CodeBlock, type RunStep, RunStatus, RunSteps, type StepStatus } from "./run";
export { Select, type SelectGroup, type SelectOption } from "./select";
export { CopyField, SettingsGroup, SettingsRow } from "./settings";
export { Pagination, Stepper } from "./steps";
export { Card, DescriptionList, EmptyState, ListCard, Panel, Skeleton, Tooltip } from "./surface";
export { Checkbox, Switch } from "./switch";
export { Table, Td, Th, Tr } from "./table";
export { Terminal, TermText } from "./terminal";
export { Segmented, type TabOption, Tabs } from "./tabs";
export { Heading, Text, type TextSize, type TextTone } from "./text";
export { notify, Toasts } from "./toast";
export { FilterChip, Toolbar, ToolbarButton } from "./toolbar";
export { FileTree, type TreeNode } from "./tree";
export { type VariantProps, variants } from "./variants";
