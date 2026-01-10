using MirroringMain;
using System;
using System.Windows.Forms;

namespace WinFormsApp
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
    }
}