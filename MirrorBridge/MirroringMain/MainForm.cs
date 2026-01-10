using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace MirroringMain
{
    public partial class MainForm : Form
    {
        private WebView2 webViewLeft;
        private WebView2 webViewRight;

        public MainForm()
        {
            InitializeComponent();

            Text = "WebView2 SharedWorker Mirror 샘플";
            Width = 1000;
            Height = 600;

            webViewLeft = new WebView2 { Dock = DockStyle.Left, Width = ClientSize.Width / 2 };
            webViewRight = new WebView2 { Dock = DockStyle.Fill };

            Controls.Add(webViewRight);
            Controls.Add(webViewLeft);

            Load += MainForm_Load;
        }

        private async void MainForm_Load(object? sender, EventArgs e)
        {
            // 출력 폴더의 Web 폴더를 가리킴
            string exeDir = AppContext.BaseDirectory;
            string webRoot = Path.Combine(exeDir, "Web");

            var options = new CoreWebView2EnvironmentOptions(
                "--remote-debugging-port=9333"
            );

            var env = await CoreWebView2Environment.CreateAsync(
                null,   // Edge 설치 경로 (null = 기본)
                null,   // User Data Folder
                options
            );

            // 각 WebView2 초기화 후 동일 가상 호스트로 매핑
            await webViewLeft.EnsureCoreWebView2Async(env);
            
            await webViewRight.EnsureCoreWebView2Async(env);


            // 로드할 URL: http://127.0.0.1:5500/main.htm 와 http://127.0.0.1:5500/sub.html
            webViewLeft.CoreWebView2.Navigate("http://127.0.0.1:5500/main.html");
            webViewRight.CoreWebView2.Navigate("http://127.0.0.1:5500/sub.html");
        }
    }
}