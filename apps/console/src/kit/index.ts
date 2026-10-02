/**
 * Grid's design system: every screen is built from these. `/design` shows every piece in every
 * state.
 */
export {
	AgentLogo,
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
export { BrandLogo, BrandMark, BrandWordmark, Splash } from "./brand";
export { Button, button, IconButton, iconButton, LinkButton, linkButton, TextLink } from "./button";
export {
	BoardColumn,
	BoardSkeleton,
	BoardStat,
	BoardStats,
	CardChip,
	DoneRow,
	LaneDot,
	type LaneTone,
	LaneStrip,
	MiniBars,
	TaskCard,
	TaskStatus,
	type TaskStatusKind,
	taskStatusLabel,
} from "./board";
export {
	type ChoiceCardOption,
	ChoiceCards,
	ChoiceChips,
	ColorSwatches,
	GlyphChoices,
	RadioCards,
	type RadioOption,
	Slider,
} from "./choice";
export { CodeEditor, type CodeEditorProps } from "./code-editor";
export {
	type BlameBlock,
	BlameLines,
	type Caret,
	CodeAskAction,
	CodeAskBar,
	CodeLines,
	CodeMinimap,
	type LineMark,
	type LineRange,
	StatusStrip,
} from "./code-lines";
export { ConfirmDialog, Dialog, PanelBar, PanelFooter } from "./dialog";
export { diffLines } from "./diff";
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
	TopLoadingBar,
} from "./feedback";
export {
	CardRow,
	DotLine,
	type FeedTone,
	FeedGroup,
	FeedRow,
	InfoStrip,
	SectionCard,
	ToneTile,
} from "./feed";
export { attachContextMenu, LONG_PRESS_MS, type MenuPoint } from "./context-menu";
export { AppFrame, AuthCard, AuthFrame, AuthHead } from "./frame";
export {
	Field,
	InlineInput,
	QuietInput,
	Input,
	PasswordInput,
	SearchInput,
	Textarea,
	TitleInput,
} from "./field";
export * from "./icons";
export { Divider, Grid, MainAside, Page, PageHeader, Row, Section, Spacer, Stack } from "./layout";
export { Breadcrumbs, type HeaderTab, HeaderTabs } from "./header";
export { Menu, MENU_ITEM, type MenuGroup, type MenuItem, MenuList, menuTrigger } from "./menu";
export {
	AgentHeader,
	AgentMessage,
	Attachment,
	DiffCard,
	type DiffLine,
	DiffStat,
	FactGroup,
	formatFileSize,
	Prose,
	ThreadHeader,
	UserMessage,
} from "./message";
export {
	BrandTile,
	MachineCard,
	NavButton,
	NavGroup,
	NavLink,
	NavNote,
	NavSection,
	PanelHeader,
	RailButton,
	RailLink,
	railItem,
} from "./nav";
export { type AutocompleteItem, AutocompleteList, Palette, type PaletteItem } from "./palette";
export { type Placement, Popover, type PopoverControl } from "./popover";
export {
	MIC_BUTTON,
	PROMPT_ADD,
	PROMPT_CHIP,
	PROMPT_FIELD,
	PROMPT_ICON,
	PromptBox,
	PromptHints,
	SEND_BUTTON,
	STOP_BUTTON,
	Suggestions,
	ContextMeter,
	VoiceBar,
	WorkingRing,
} from "./prompt-box";
export { Checklist, ChoicePrompt, DecisionCard, ProgressRing } from "./prompts";
export {
	CodeBlock,
	CodeChip,
	CodeView,
	Disclosure,
	InlineNotice,
	NoticeCard,
	type PlanEntry,
	PlanList,
	Pre,
	ProjectTile,
	Rail,
	RunStatus,
	type RunStep,
	RunSteps,
	StepGlyph,
	type StepStatus,
	type StepTone,
	TurnHeader,
	WorkCard,
	WorkStep,
} from "./run";
export { type EffortLevel, EffortSlider } from "./effort";
export { type ArrivalOptions, playArrival } from "./arrival";
export { ListDetail, ListRow, PaneHeader } from "./pane";
export { type AgentChoice, AgentChoices, FlagshipMark, ModelRow } from "./picker";
export { PixelMark, ProjectMark, type ProjectMarkShape } from "./project-mark";
export { FLOATING_MIC, VoiceDock, VoiceError, VoiceStatus } from "./voice";
export { Select, type SelectGroup, type SelectOption } from "./select";
export { CopyField, PropertyRow, SettingsGroup, SettingsRow } from "./settings";
export { Pagination, Stepper } from "./steps";
export { Card, DescriptionList, EmptyState, ListCard, Panel, Skeleton, Tooltip } from "./surface";
export { Checkbox, CheckboxField, Switch } from "./switch";
export { Table, Td, Th, Tr } from "./table";
export {
	JumpToLatest,
	KeyStrip,
	PageDots,
	SelectionBar,
	SelectionHandle,
	Terminal,
	terminalKey,
	TermText,
	TouchScrollbar,
} from "./terminal";
export { Segmented, type TabOption, Tabs } from "./tabs";
export { Code, Heading, Text, type TextSize, type TextTone } from "./text";
export { notify, Toasts } from "./toast";
export { TooltipLayer } from "./tooltip-layer";
export { attachEdgeFade } from "./edge-fade";
export { FilterChip, Toolbar, ToolbarButton } from "./toolbar";
export { EntryIcon, type FileIconResolver, setFileIcons } from "./file-icon";
export {
	FileRow,
	type FolderEntry,
	FileTree,
	FolderTree,
	GitBadge,
	GitMark,
	type TreeNode,
} from "./tree";
export { type VariantProps, variants } from "./variants";
export {
	ROLE_CHIP,
	ROLE_CHIP_ICON,
	ROLE_ICONS,
	NoRoleMark,
	NoRoleRow,
	PANEL_ACTION,
	RoleChipGroup,
	type RoleIcon,
	RoleIconChoices,
	RoleMark,
	TeamRow,
} from "./role";
export {
	EditTextButton,
	FileChoice,
	FileMention,
	FORMAT_BUTTON,
	FORMAT_STYLE,
	FormatAsk,
	FormatBar,
	FormatFootBar,
	FormatSeparator,
	NOTE_FIELD,
	NOTE_GLYPHS,
	NOTE_TITLE,
	NoteAskDock,
	type NoteBlock,
	NoteBlocks,
	NoteCaption,
	NoteCard,
	NoteColumn,
	NoteGlyph,
	NoteGlyphChoices,
	type NoteGlyphName,
	NoteGroupLabel,
	type NoteInline,
	type NoteListItem,
	NoteListRow,
	NoteMeta,
	NoteSearchField,
	NotePanelRow,
	SharedChip,
	ThreadChip,
} from "./note";
