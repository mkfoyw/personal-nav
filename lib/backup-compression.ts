const MAX_BACKUP_BYTES = 10_000_000;

export async function compressBackupJson(text: string): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") throw new Error("当前浏览器不支持 gzip 压缩，无法上传备份");
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error("备份内容不能超过 10 MB");
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decompressBackupJson(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持 gzip 解压，无法恢复压缩备份");
  const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BACKUP_BYTES) throw new Error("解压后的备份超过 10 MB，无法恢复");
      chunks.push(value);
    }
  } catch (cause) {
    await reader.cancel().catch(() => {});
    if (cause instanceof Error && cause.message.includes("超过 10 MB")) throw cause;
    throw new Error("GitHub 上的压缩备份已损坏或格式不正确");
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(output); }
  catch { throw new Error("GitHub 上的压缩备份不是有效 UTF-8 文本"); }
}
