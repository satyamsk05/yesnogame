import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos, error } = await supabase.from("todos").select();

  if (error) {
    console.error("Supabase query error:", error);
  }

  return (
    <div style={{ padding: 40, backgroundColor: "var(--background)", minHeight: "100vh" }}>
      <h2 style={{ marginBottom: 20 }}>Supabase Integration Test (Todos)</h2>
      {error ? (
        <div style={{ color: "var(--color-down)" }}>Error: {error.message}. Make sure your <code>todos</code> table exists in the Supabase schema.</div>
      ) : (
        <ul>
          {todos && todos.length > 0 ? (
            todos.map((todo: any) => (
              <li key={todo.id} style={{ margin: "8px 0", fontSize: 16 }}>
                {todo.name || todo.title || JSON.stringify(todo)}
              </li>
            ))
          ) : (
            <div style={{ color: "var(--text-secondary)" }}>No todos found. Add a <code>todos</code> table with rows in your Supabase dashboard to test.</div>
          )}
        </ul>
      )}
    </div>
  );
}
