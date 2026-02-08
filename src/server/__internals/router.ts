import { Context, Hono, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { MiddlewareHandler, Variables } from "hono/types";
import { StatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { Bindings } from "../env";
import { bodyParsingMiddleware, queryParsingMiddleware } from "./middleware";
import { MutationOperation, QueryOperation } from "./types";

type OperationType<I extends Record<string, unknown>, O> =
  | QueryOperation<I, O>
  | MutationOperation<I, O>;

type AppEnv = {
  Bindings: Bindings;
  Variables: Variables & {
    __middleware_output?: Record<string, unknown>;
    parsedQuery?: unknown;
    parsedBody?: unknown;
  };
};

export const router = <T extends Record<string, OperationType<any, any>>>(
  obj: T
) => {
  const route = new Hono<AppEnv>().onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        {
          error: "Server Error",
          message: err.message,
          type: "HTTPException",
        },
        err.status
      );
    }

    return c.json(
      {
        error: "Unknown Error",
        message: "An unexpected error occurred",
        type: "UnknownError",
      },
      500
    );
  });

  // ---- overload-safe helpers ----
  type AnyHandler = MiddlewareHandler<AppEnv, any, any>;
  const addGet = (path: string, ...handlers: AnyHandler[]) =>
    (route as any).on("GET", path, ...handlers);
  const addPost = (path: string, ...handlers: AnyHandler[]) =>
    (route as any).on("POST", path, ...handlers);

  const toResponse = (c: Context<AppEnv>, out: unknown): Response => {
    if (out instanceof Response) return out;
    return c.json(out);
  };

  Object.entries(obj).forEach(([key, operation]) => {
    const path: string = `/${key}`;

    const operationMiddlewares: AnyHandler[] = operation.middlewares.map(
      (middleware) => {
        const wrapperFunction: AnyHandler = async (
          c: Context<AppEnv>,
          next: Next
        ) => {
          const ctx = (c.get("__middleware_output") ??
            {}) as Record<string, unknown>;

          // args optional to match your middleware 'next' signature
          const nextWrapper = <B>(args?: B) => {
            const merged = { ...ctx, ...(args as object | undefined) };
            c.set("__middleware_output", merged);
            return merged;
          };

          const res = await middleware({ ctx, next: nextWrapper, c });
          c.set("__middleware_output", {
            ...ctx,
            ...(res as object | undefined),
          });

          await next();
        };

        return wrapperFunction;
      }
    );

    if (operation.type === "query") {
      const schema = operation.schema;

      if (schema) {
        addGet(
          path,
          queryParsingMiddleware as AnyHandler,
          ...operationMiddlewares,
          (async (c: Context<AppEnv>) => {
            const ctx = (c.get("__middleware_output") ||
              {}) as Record<string, unknown>;
            const parsedQuery = c.get("parsedQuery");

            let input: unknown;
            try {
              input = schema.parse(parsedQuery);
            } catch (err) {
              if (err instanceof ZodError) {
                throw new HTTPException(400, {
                  cause: err,
                  message: err.message,
                });
              }
              throw err;
            }

            const out = await operation.handler({ c, ctx, input });
            return toResponse(c, out);
          }) as AnyHandler
        );
      } else {
        addGet(
          path,
          ...operationMiddlewares,
          (async (c: Context<AppEnv>) => {
            const ctx = (c.get("__middleware_output") ||
              {}) as Record<string, unknown>;
            const out = await operation.handler({ c, ctx, input: undefined });
            return toResponse(c, out);
          }) as AnyHandler
        );
      }
    } else {
      const schema = operation.schema;

      if (schema) {
        addPost(
          path,
          bodyParsingMiddleware as AnyHandler,
          ...operationMiddlewares,
          (async (c: Context<AppEnv>) => {
            const ctx = (c.get("__middleware_output") ||
              {}) as Record<string, unknown>;
            const parsedBody = c.get("parsedBody");

            let input: unknown;
            try {
              input = schema.parse(parsedBody);
            } catch (err) {
              if (err instanceof ZodError) {
                throw new HTTPException(400, {
                  cause: err,
                  message: err.message,
                });
              }
              throw err;
            }

            const out = await operation.handler({ c, ctx, input });
            return toResponse(c, out);
          }) as AnyHandler
        );
      } else {
        addPost(
          path,
          ...operationMiddlewares,
          (async (c: Context<AppEnv>) => {
            const ctx = (c.get("__middleware_output") ||
              {}) as Record<string, unknown>;
            const out = await operation.handler({ c, ctx, input: undefined });
            return toResponse(c, out);
          }) as AnyHandler
        );
      }
    }
  });

  type InferInput<X> = X extends OperationType<infer I, any> ? I : {};
  type InferOutput<X> = X extends OperationType<any, infer O> ? O : {};

  return route as Hono<
    { Bindings: Bindings; Variables: Variables },
    {
      [K in keyof T]: T[K] extends QueryOperation<any, any>
        ? {
            $get: {
              input: InferInput<T[K]>;
              output: InferOutput<T[K]>;
              outputFormat: "json";
              status: StatusCode;
            };
          }
        : {
            $post: {
              input: InferInput<T[K]>;
              output: InferOutput<T[K]>;
              outputFormat: "json";
              status: StatusCode;
            };
          };
    }
  >;
};
