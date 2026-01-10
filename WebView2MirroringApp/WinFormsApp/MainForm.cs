using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace WinFormsApp
{
    public class MainForm : Form
    {
        private WebView2 webViewLeft;
        private WebView2 webViewRight;

        public MainForm()
        {
            Text = "WebView2 SharedWorker Mirror 샘플";
            Width = 1000;
            Height = 600;

            webViewLeft = new WebView2 { Dock = DockStyle.Left, Width = ClientSize.Width / 2 };
            webViewRight = new WebView2 { Dock = DockStyle.Fill };

            Controls.Add(webViewRight);
            Controls.Add(webViewLeft);  

            Load += MainForm_Load;
        }

        private async void MainForm_Load(object sender, EventArgs e)
        {
            // 출력 폴더의 Web 폴더를 가리킴
            string exeDir = AppContext.BaseDirectory;
            string webRoot = Path.Combine(exeDir, "Web");

            // 각 WebView2 초기화 후 동일 가상 호스트로 매핑
            await webViewLeft.EnsureCoreWebView2Async();
            webViewLeft.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "appassets", webRoot, CoreWebView2HostResourceAccessKind.Allow);

            await webViewRight.EnsureCoreWebView2Async();
            webViewRight.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "appassets", webRoot, CoreWebView2HostResourceAccessKind.Allow);

            // 로드할 URL: https://appassets/main.html 와 https://appassets/sub.html
            webViewLeft.CoreWebView2.Navigate("http://127.0.0.1:5500/main.html");
            webViewRight.CoreWebView2.Navigate(http://127.0.0.1:5500/sub.html);
        }
    }
}