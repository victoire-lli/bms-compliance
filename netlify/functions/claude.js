exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405 };
  const body = JSON.parse(event.body);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return {
    statusCode: res.status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
};
