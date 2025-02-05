/*global Ultraviolet*/
self.__uv$config = {
    prefix: '/class/',
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: '/staff/uv.handler.js',
    client: '/staff/uv.client.js',
    bundle: '/staff/uv.bundle.js',
    config: '/staff/uv.config.js',
    sw: '/staff/uv.sw.js',
};
