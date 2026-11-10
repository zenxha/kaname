/** Cloudflare's bundler turns an imported .wasm file into a compiled WebAssembly module. */
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
