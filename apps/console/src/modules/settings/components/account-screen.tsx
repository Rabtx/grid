import type { JSX } from "@solidjs/web";

import { Avatar, Button, Row, SettingsGroup, SettingsRow, SignOutIcon, Stack, Text } from "@/kit";
import { useAuth } from "@/modules/auth";

import { SettingsPage } from "./settings-page";

/** Settings → Account: who is signed in to this console, and signing out. */
export function AccountScreen(): JSX.Element {
	const auth = useAuth();
	const name = () => auth.user()?.username ?? auth.user()?.email ?? "Signed in";

	return (
		<SettingsPage title="Account" description="Who is signed in to this console.">
			<SettingsGroup title="Signed in">
				<div class="px-4 py-4">
					<Row gap={3}>
						<Avatar name={name()} size="lg" />
						<Stack gap={0.5} class="min-w-0">
							<Text tone="strong" weight="medium" truncate>
								{name()}
							</Text>
							<Text size="caption" tone="subtle" truncate>
								{auth.user()?.email}
							</Text>
						</Stack>
					</Row>
				</div>
				<SettingsRow inline label="Sign out" description="Ends this session on this device.">
					<Button icon={<SignOutIcon size="sm" />} onClick={() => void auth.logout()}>
						Sign out
					</Button>
				</SettingsRow>
			</SettingsGroup>
		</SettingsPage>
	);
}
