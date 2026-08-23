const WORKER_URL = 'https://spv-receipt-service.keyurgohil-uk.workers.dev';

export async function installReceiptWorkerMock(page, {
  uploadStatus = 200,
  downloadStatus = 200,
  deleteStatus = 200,
  objectPath = 'receipts/expense-playwright/mock-receipt.pdf',
  downloadBody = '%PDF-1.4 mocked receipt'
} = {}) {
  const calls = [];

  await page.route(`${WORKER_URL}/receipts/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    calls.push({
      method,
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postDataBuffer()
    });

    if (method === 'PUT') {
      if (uploadStatus !== 200) {
        await route.fulfill({
          status: uploadStatus,
          contentType: 'application/json',
          body: JSON.stringify({ error: uploadStatus === 401 ? 'Unauthorized' : 'Receipt upload failed' })
        });
        return;
      }
      const name = decodeURIComponent((await request.allHeaders())['x-receipt-name'] || 'receipt.pdf');
      const body = request.postDataBuffer() || Buffer.alloc(0);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          objectPath,
          name,
          type: (await request.allHeaders())['content-type'] || 'application/octet-stream',
          size: body.length,
          uploadedAt: '2026-08-23T12:00:00.000Z'
        })
      });
      return;
    }

    if (method === 'GET') {
      await route.fulfill({
        status: downloadStatus,
        contentType: downloadStatus === 200 ? 'application/pdf' : 'application/json',
        body: downloadStatus === 200 ? downloadBody : JSON.stringify({ error: 'Receipt not found' })
      });
      return;
    }

    if (method === 'DELETE') {
      await route.fulfill({
        status: deleteStatus,
        contentType: 'application/json',
        body: JSON.stringify(deleteStatus === 200 ? { deleted: true } : { error: 'Receipt deletion failed' })
      });
      return;
    }

    await route.fulfill({ status: 405, body: 'Method not allowed' });
  });

  return {
    calls,
    callsFor(method) {
      return calls.filter((call) => call.method === method);
    }
  };
}
