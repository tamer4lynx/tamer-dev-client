package {{PACKAGE_NAME}};

import {{PACKAGE_NAME}}.BuildConfig;
import {{PACKAGE_NAME}}.DevServerPrefs;
import com.lynx.tasm.provider.AbsTemplateProvider;
import com.lynx.tasm.resourceprovider.LynxResourceCallback;
import com.lynx.tasm.resourceprovider.LynxResourceRequest;
import com.lynx.tasm.resourceprovider.LynxResourceResponse;
import com.lynx.tasm.resourceprovider.LynxResourceResponse.ResponseState;
import com.lynx.tasm.resourceprovider.generic.LynxGenericResourceFetcher;
import com.lynx.tasm.resourceprovider.template.LynxTemplateResourceFetcher;
import com.lynx.tasm.resourceprovider.template.TemplateProviderResult;

public class TemplateProvider extends AbsTemplateProvider {
    private static final String DEV_CLIENT_BUNDLE = "dev-client.lynx.bundle";
    private static final String TAMER_DEBUG_BUNDLE = "tamer-debug.lynx.bundle";
    private static final String PROJECT_BUNDLE_SEGMENT = "{{PROJECT_BUNDLE_SEGMENT}}";
    private final android.content.Context context;
    public final LynxGenericResourceFetcher genericResourceFetcher;
    public final LynxTemplateResourceFetcher templateResourceFetcher;

    public TemplateProvider(android.content.Context context) {
        this.context = context.getApplicationContext();
        this.genericResourceFetcher = new LynxGenericResourceFetcher() {
            @Override
            public void fetchResource(LynxResourceRequest request, LynxResourceCallback<byte[]> callback) {
                loadBytesAsync(request.getUrl(), callback);
            }

            @Override
            public void fetchResourcePath(LynxResourceRequest request, LynxResourceCallback<String> callback) {
                callback.onResponse(LynxResourceResponse.onFailed(new java.io.IOException("Asset path lookup is not supported")));
            }
        };
        this.templateResourceFetcher = new LynxTemplateResourceFetcher() {
            @Override
            public void fetchTemplate(LynxResourceRequest request, LynxResourceCallback<TemplateProviderResult> callback) {
                loadBytesAsync(request.getUrl(), new LynxResourceCallback<byte[]>() {
                    @Override
                    public void onResponse(LynxResourceResponse<byte[]> response) {
                        if (response.getState() == ResponseState.SUCCESS && response.getData() != null) {
                            callback.onResponse(LynxResourceResponse.onSuccess(TemplateProviderResult.fromBinary(response.getData())));
                        } else {
                            Throwable error = response.getError() != null ? response.getError() : new java.io.IOException("Template load failed");
                            callback.onResponse(LynxResourceResponse.onFailed(error));
                        }
                    }
                });
            }

            @Override
            public void fetchSSRData(LynxResourceRequest request, LynxResourceCallback<byte[]> callback) {
                loadBytesAsync(request.getUrl(), callback);
            }
        };
    }

    @Override
    public void loadTemplate(String url, final Callback callback) {
        new Thread(() -> {
            try {
                callback.onSuccess(loadBytes(url));
            } catch (java.io.IOException e) {
                callback.onFailed(e.getMessage());
            }
        }).start();
    }

    private void loadBytesAsync(String url, LynxResourceCallback<byte[]> callback) {
        new Thread(() -> {
            try {
                callback.onResponse(LynxResourceResponse.onSuccess(loadBytes(url)));
            } catch (java.io.IOException e) {
                callback.onResponse(LynxResourceResponse.onFailed(e));
            }
        }).start();
    }

    private byte[] loadBytes(String url) throws java.io.IOException {
        if (isEmbeddedDevShellUrl(url)) {
            return loadAssetBytes(url != null && url.contains(TAMER_DEBUG_BUNDLE) ? TAMER_DEBUG_BUNDLE : DEV_CLIENT_BUNDLE);
        }
        if (BuildConfig.DEBUG) {
            byte[] data = loadFromDevServer(url);
            if (data != null) return data;
        }
        return loadAssetBytes(normalizeAssetPath(url));
    }

    private byte[] loadFromDevServer(String url) {
        String devUrl = DevServerPrefs.INSTANCE.getUrl(context);
        if (devUrl == null || devUrl.isEmpty()) return null;
        try {
            java.net.URL u = new java.net.URL(devUrl.trim());
            int port = u.getPort();
            String host = u.getHost() != null ? u.getHost() : "127.0.0.1";
            String scheme = u.getProtocol() != null ? u.getProtocol() : "http";
            String origin = scheme + "://" + host + (port > 0 ? ":" + port : ("http".equalsIgnoreCase(scheme) ? ":3000" : ""));
            String configuredPath = u.getPath() != null ? u.getPath().replaceAll("/+$", "") : "";
            String normalized = normalizeAssetPath(url);
            java.util.ArrayList<String> candidatePaths = new java.util.ArrayList<>();
            if (!configuredPath.isEmpty()) candidatePaths.add(configuredPath + "/" + normalized);
            if (!PROJECT_BUNDLE_SEGMENT.isEmpty()) candidatePaths.add("/" + PROJECT_BUNDLE_SEGMENT + "/" + normalized);
            candidatePaths.add("/" + normalized);
            okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(15, java.util.concurrent.TimeUnit.SECONDS)
                .build();
            for (String candidatePath : candidatePaths) {
                String fetchUrl = origin + (candidatePath.startsWith("/") ? candidatePath : "/" + candidatePath);
                okhttp3.Request request = new okhttp3.Request.Builder().url(fetchUrl).build();
                try (okhttp3.Response response = client.newCall(request).execute()) {
                    if (response.isSuccessful() && response.body() != null) {
                        return response.body().bytes();
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static boolean isEmbeddedDevShellUrl(String url) {
        if (url == null) return false;
        return url.equals(DEV_CLIENT_BUNDLE) || url.endsWith("/" + DEV_CLIENT_BUNDLE) || url.contains(DEV_CLIENT_BUNDLE)
            || url.equals(TAMER_DEBUG_BUNDLE) || url.endsWith("/" + TAMER_DEBUG_BUNDLE) || url.contains(TAMER_DEBUG_BUNDLE);
    }

    private byte[] loadAssetBytes(String assetPath) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream is = context.getAssets().open(assetPath)) {
            byte[] buf = new byte[1024];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
        }
        return baos.toByteArray();
    }

    private String normalizeAssetPath(String url) {
        if (url == null) return "";
        String s = url.trim();
        int hash = s.indexOf('#');
        if (hash >= 0) s = s.substring(0, hash);
        int query = s.indexOf('?');
        if (query >= 0) s = s.substring(0, query);
        try {
            java.net.URI uri = new java.net.URI(s);
            if (uri.getScheme() != null && uri.getPath() != null && !uri.getPath().isEmpty()) {
                s = uri.getPath();
            }
        } catch (Exception ignored) {
        }
        s = s.replace('\\', '/');
        while (s.startsWith("/")) s = s.substring(1);
        s = stripBeforeMarker(s, ".lynx.bundle/");
        s = stripBeforeMarker(s, ".web.bundle/");
        s = stripBeforeMarker(s, "static/");
        s = stripBeforeMarker(s, "assets/");
        s = stripBeforeMarker(s, "tamer-assets.json");
        String normalized = java.nio.file.Paths.get(s).normalize().toString().replace('\\', '/');
        if (normalized.equals("..") || normalized.startsWith("../")) return "";
        return normalized;
    }

    private static String stripBeforeMarker(String value, String marker) {
        int index = value.indexOf(marker);
        if (index < 0) return value;
        if (index == 0) return value;
        if (marker.endsWith("/")) return value.substring(index + marker.length());
        return value.substring(index);
    }
}
