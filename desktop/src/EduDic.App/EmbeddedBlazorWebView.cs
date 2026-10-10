using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Components.WebView.Wpf;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;

namespace EduDic.App;

/// <summary>단일 exe 배포용 BlazorWebView: 화면 파일(wwwroot)과 Blazor 스크립트를 exe 안에서 읽는다 (업무노트와 같은 방식)</summary>
public class EmbeddedBlazorWebView : BlazorWebView
{
    public override IFileProvider CreateFileProvider(string contentRootDir)
    {
        var asm = typeof(EmbeddedBlazorWebView).Assembly;
        return new CompositeFileProvider(new ManifestEmbeddedFileProvider(asm, "wwwroot", DateTimeOffset.UtcNow), new FrameworkFiles(asm));
    }

    sealed class FrameworkFiles(Assembly asm) : IFileProvider
    {
        public IFileInfo GetFileInfo(string subpath) => subpath.TrimStart('/') switch
        {
            "_framework/blazor.webview.js" => new Res(asm, "framework/blazor.webview.js", "blazor.webview.js"),
            "_framework/blazor.modules.json" => new Text("blazor.modules.json", "[]"),
            _ => new NotFoundFileInfo(subpath),
        };
        public IDirectoryContents GetDirectoryContents(string subpath) => NotFoundDirectoryContents.Singleton;
        public IChangeToken Watch(string filter) => NullChangeToken.Singleton;
    }

    sealed class Res(Assembly asm, string resource, string name) : IFileInfo
    {
        public bool Exists => asm.GetManifestResourceInfo(resource) != null;
        public long Length { get { using var s = CreateReadStream(); return s.Length; } }
        public string? PhysicalPath => null;
        public string Name => name;
        public DateTimeOffset LastModified => DateTimeOffset.UtcNow;
        public bool IsDirectory => false;
        public Stream CreateReadStream() => asm.GetManifestResourceStream(resource)!;
    }

    sealed class Text(string name, string content) : IFileInfo
    {
        public bool Exists => true;
        public long Length => System.Text.Encoding.UTF8.GetByteCount(content);
        public string? PhysicalPath => null;
        public string Name => name;
        public DateTimeOffset LastModified => DateTimeOffset.UtcNow;
        public bool IsDirectory => false;
        public Stream CreateReadStream() => new MemoryStream(System.Text.Encoding.UTF8.GetBytes(content));
    }
}
