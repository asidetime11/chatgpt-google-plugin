const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 8765);

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Mock Conversation - ChatGPT</title>
    <link rel="stylesheet" href="/src/styles.css">
    <style>
      body {
        margin: 0;
        background: #f7f7f7;
        color: #111;
        font-family: Arial, sans-serif;
      }

      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 48px 24px 800px;
      }

      article {
        margin: 18px 0;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 10px;
        background: #fff;
        line-height: 1.65;
      }

      article[data-role="user"] {
        background: #eef2ff;
      }

      .spacer {
        height: 260px;
      }
    </style>
  </head>
  <body>
    <main>
      <article data-role="user">请解释 verifier 是什么。</article>
      <article data-message-author-role="assistant">
        <h2>Verifier 是什么</h2>
        <p>Verifier 通常是一个用于检查、验证或评估结果是否满足条件的组件。在模型工作流中，它可以判断答案、证明、代码或推理链是否可信。</p>
      </article>
      <div class="spacer"></div>
      <article data-role="user">它和 generator 有什么区别？</article>
      <article data-message-author-role="assistant">
        <h2>Generator 与 Verifier</h2>
        <p>Generator 负责提出候选答案，Verifier 负责检查候选答案。一个生成，一个验证。</p>
      </article>
      <div class="spacer"></div>
      <article data-role="user">请给我一个使用场景。</article>
      <article data-message-author-role="assistant">
        <h2>使用场景</h2>
        <p>比如代码生成后，Verifier 可以运行测试、检查约束，或者验证输出格式。</p>
      </article>
    </main>
    <script src="/src/content.js"></script>
  </body>
</html>`;

const server = http.createServer((request, response) => {
  if (request.url === "/" || request.url === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  if (request.url === "/src/content.js" || request.url === "/src/styles.css") {
    const filePath = path.join(process.cwd(), request.url.slice(1));
    response.writeHead(200, {
      "content-type": request.url.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : "text/css; charset=utf-8"
    });
    response.end(fs.readFileSync(filePath));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Test server listening at http://127.0.0.1:${port}/`);
});
