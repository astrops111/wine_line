"""
BaseAgent — Shared agentic loop for all 4 QA agents.

Uses the OpenAI-compatible DashScope API with Qwen models.
Each subclass implements _dispatch(tool_name, tool_input) -> str
and defines its own tool list and system prompt.
"""
import json
import os

try:
    from openai import OpenAI
except ImportError:
    raise ImportError("Run: pip install openai")

MAX_ITERATIONS = 25
DEFAULT_MODEL  = os.environ.get("QWEN_MODEL", "qwen3.5-plus")
DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"


def _load_env_key(key_name: str) -> str | None:
    """Read a key from environment or .env files."""
    val = os.environ.get(key_name)
    if val:
        return val
    # Try root .env and admin/.env
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "..", "..", "..", ".env"),       # root
        os.path.join(script_dir, "..", "..", ".env"),             # admin/
    ]
    for path in candidates:
        path = os.path.normpath(path)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f"{key_name}="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


class BaseAgent:
    def __init__(self, name: str, system_prompt: str, tools: list[dict]):
        self.name          = name
        self.system_prompt = system_prompt
        self.tools         = tools

        api_key = _load_env_key("DASHSCOPE_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "DASHSCOPE_API_KEY not found in environment or .env files.\n"
                "Add DASHSCOPE_API_KEY=sk-... to the root .env file."
            )

        self.client = OpenAI(api_key=api_key, base_url=DASHSCOPE_BASE)
        self.model  = _load_env_key("QWEN_MODEL") or DEFAULT_MODEL

    def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        """Subclasses implement this to handle tool calls."""
        raise NotImplementedError(f"Tool '{tool_name}' not implemented in {self.name}")

    def run_loop(self, user_message: str) -> str:
        """
        Execute the agentic loop.
        Returns the final text content from the model.
        """
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user",   "content": user_message},
        ]

        for iteration in range(MAX_ITERATIONS):
            response = self.client.chat.completions.create(
                model=self.model,
                tools=self.tools,
                tool_choice="auto",
                messages=messages,
                max_tokens=8192,
            )

            choice  = response.choices[0]
            message = choice.message

            # Accumulate assistant message
            messages.append({
                "role":       "assistant",
                "content":    message.content or "",
                "tool_calls": [
                    {
                        "id":       tc.id,
                        "type":     "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in (message.tool_calls or [])
                ] or None,
            })

            if choice.finish_reason == "stop":
                return message.content or ""

            if choice.finish_reason != "tool_calls" or not message.tool_calls:
                return message.content or f"[{self.name}] stopped: {choice.finish_reason}"

            # Dispatch each tool call and collect results
            for tc in message.tool_calls:
                try:
                    args   = json.loads(tc.function.arguments or "{}")
                    result = self._dispatch(tc.function.name, args)
                except Exception as exc:
                    result = f"ERROR in tool '{tc.function.name}': {exc}"

                messages.append({
                    "role":         "tool",
                    "tool_call_id": tc.id,
                    "content":      str(result),
                })

        return f"[{self.name}] reached max iterations ({MAX_ITERATIONS})"
