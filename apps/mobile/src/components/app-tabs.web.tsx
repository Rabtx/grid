import {
	TabList,
	type TabListProps,
	TabSlot,
	Tabs,
	TabTrigger,
	type TabTriggerSlotProps,
} from "expo-router/ui";
import { SymbolView } from "expo-symbols";
import { Pressable, useColorScheme, View } from "react-native";
import { Colors, MaxContentWidth } from "@/constants/theme";
import { ExternalLink } from "./external-link";
import { ThemedText } from "./themed-text";
import { ThemedView } from "./themed-view";

export default function AppTabs() {
	return (
		<Tabs>
			<TabSlot style={{ height: "100%" }} />
			<TabList asChild>
				<CustomTabList>
					<TabTrigger name="home" href="/" asChild>
						<TabButton>Home</TabButton>
					</TabTrigger>
					<TabTrigger name="explore" href={"/explore" as any} asChild>
						<TabButton>Explore</TabButton>
					</TabTrigger>
				</CustomTabList>
			</TabList>
		</Tabs>
	);
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
	return (
		<Pressable {...props} className="active:opacity-70">
			<ThemedView
				type={isFocused ? "backgroundSelected" : "backgroundElement"}
				className="py-1 px-4 rounded-xl"
			>
				<ThemedText type="small" themeColor={isFocused ? "text" : "textSecondary"}>
					{children}
				</ThemedText>
			</ThemedView>
		</Pressable>
	);
}

export function CustomTabList(props: TabListProps) {
	const scheme = useColorScheme();
	const colors = Colors[scheme === "unspecified" ? "light" : scheme];

	return (
		<View {...props} className="absolute w-full p-4 justify-center items-center flex-row">
			<ThemedView
				type="backgroundElement"
				className="py-2 px-6 rounded-3xl flex-row items-center grow gap-2"
				style={{ maxWidth: MaxContentWidth }}
			>
				<ThemedText type="smallBold" className="mr-auto">
					Expo Grid
				</ThemedText>

				{props.children}

				<ExternalLink href="https://docs.expo.dev" asChild>
					<Pressable className="flex-row justify-center items-center gap-1 ml-4 active:opacity-70">
						<ThemedText type="link">Docs</ThemedText>
						<SymbolView
							tintColor={colors.text}
							name={{ ios: "arrow.up.right.square", web: "link" }}
							size={12}
						/>
					</Pressable>
				</ExternalLink>
			</ThemedView>
		</View>
	);
}
