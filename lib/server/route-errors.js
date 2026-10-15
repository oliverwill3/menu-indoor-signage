export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class AuthError extends ApiError {}

export function handleRouteError(error, context) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(context, error);
  return Response.json({ error: "Ocorreu um erro interno do servidor." }, { status: 500 });
}
