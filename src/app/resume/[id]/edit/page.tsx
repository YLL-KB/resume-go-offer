export default async function EditResumePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	return (
		<div className="flex items-center justify-center min-h-screen">
			<p className="text-muted-foreground">编辑简历 #{id} — 开发中</p>
		</div>
	);
}
