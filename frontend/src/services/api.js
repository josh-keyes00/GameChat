export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    let errorMessage = 'Request failed.';
    try {
      const data = await res.json();
      errorMessage = data.error || errorMessage;
    } catch (err) {
      // ignore
    }
    const error = new Error(errorMessage);
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}