self.__uv$config = {
  prefix: '/proxy/service/',
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: '/proxy/uv/uv.handler.js',
  bundle: '/proxy/uv/uv.bundle.js',
  config: '/proxy/uv/uv.config.js',
  sw: '/proxy/uv/uv.sw.js',
  // Public bare server — swap this out with your own Render/Railway deployment for better reliability
  bare: 'https://uv.holyubofficial.net/',
};
