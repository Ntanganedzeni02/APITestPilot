import { releaseContext } from '../../../../../lib/releases/context';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const c = await releaseContext();
    if (!c) return new Response('Unavailable', { status: 404 });
    const report = await c.repo.report(
      c.workspace.id,
      c.project.id,
      (await params).reportId,
    );
    if (!report) return new Response('Unavailable', { status: 404 });
    return Response.json(report, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="testpilot-report-${report.id}.json"`,
      },
    });
  } catch {
    return new Response('Unavailable', { status: 404 });
  }
}
