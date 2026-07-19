using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

[assembly: AssemblyTitle("Founders Finance")]
[assembly: AssemblyDescription("Local Founders Finance application launcher")]
[assembly: AssemblyCompany("Founders Finance")]
[assembly: AssemblyProduct("Founders Finance")]
[assembly: AssemblyCopyright("Copyright 2026")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class FoundersFinanceLauncher
{
    private const string AppUrl = "http://127.0.0.1:5175/";
    private const string ApiHealthUrl = "http://127.0.0.1:8081/api/healthz";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr handle, string text, string caption, uint type);

    [STAThread]
    private static void Main()
    {
        bool ownsMutex;
        using (var mutex = new Mutex(true, "Local\\FoundersFinanceLauncher", out ownsMutex))
        {
            if (!ownsMutex) return;
            try
            {
                string root = FindRepositoryRoot();
                EnsureApplicationReady(root);
                OpenApplication();
            }
            catch (Exception error)
            {
                MessageBox(IntPtr.Zero,
                    error.Message + "\n\nReview .local\\runtime for service logs.",
                    "Founders Finance could not start", 0x10);
            }
        }
    }

    private static string FindRepositoryRoot()
    {
        string configured = Environment.GetEnvironmentVariable("FOUNDERS_FINANCE_HOME");
        string[] candidates = new[] { configured, AppDomain.CurrentDomain.BaseDirectory, Environment.CurrentDirectory };
        foreach (string candidate in candidates)
        {
            if (String.IsNullOrWhiteSpace(candidate)) continue;
            DirectoryInfo current = new DirectoryInfo(Path.GetFullPath(candidate));
            for (int depth = 0; current != null && depth < 8; depth++, current = current.Parent)
            {
                if (File.Exists(Path.Combine(current.FullName, "package.json"))
                    && File.Exists(Path.Combine(current.FullName, ".env"))
                    && File.Exists(Path.Combine(current.FullName, "scripts", "src", "local-app.ts")))
                {
                    return current.FullName;
                }
            }
        }
        throw new InvalidOperationException("The Founders Finance application folder could not be located.");
    }

    private static void EnsureApplicationReady(string root)
    {
        if (EndpointReady(AppUrl) && EndpointReady(ApiHealthUrl)) return;
        string pnpm = FindPnpm();
        var start = new ProcessStartInfo
        {
            FileName = pnpm,
            Arguments = "run app:start",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        using (Process process = Process.Start(start))
        {
            if (process == null) throw new InvalidOperationException("The local application launcher did not start.");
            if (!process.WaitForExit(300000))
            {
                process.Kill();
                throw new TimeoutException("Founders Finance did not finish starting within five minutes.");
            }
            if (process.ExitCode != 0 && !(EndpointReady(AppUrl) && EndpointReady(ApiHealthUrl)))
            {
                throw new InvalidOperationException("The local services reported a startup error.");
            }
        }

        DateTime deadline = DateTime.UtcNow.AddSeconds(45);
        while (DateTime.UtcNow < deadline)
        {
            if (EndpointReady(AppUrl) && EndpointReady(ApiHealthUrl)) return;
            Thread.Sleep(500);
        }
        throw new TimeoutException("The local services started but did not become ready.");
    }

    private static string FindPnpm()
    {
        string roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string installed = Path.Combine(roaming, "npm", "pnpm.cmd");
        if (File.Exists(installed)) return installed;
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string directory in path.Split(Path.PathSeparator))
        {
            if (String.IsNullOrWhiteSpace(directory)) continue;
            string candidate = Path.Combine(directory.Trim(), "pnpm.cmd");
            if (File.Exists(candidate)) return candidate;
        }
        throw new FileNotFoundException("pnpm.cmd was not found. Install pnpm or add it to PATH.");
    }

    private static bool EndpointReady(string url)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = 2000;
            request.ReadWriteTimeout = 2000;
            using (var response = (HttpWebResponse)request.GetResponse())
            {
                int status = (int)response.StatusCode;
                return status >= 200 && status < 400;
            }
        }
        catch { return false; }
    }

    private static void OpenApplication()
    {
        string edgeX86 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            "Microsoft", "Edge", "Application", "msedge.exe");
        string edge64 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Microsoft", "Edge", "Application", "msedge.exe");
        string edge = File.Exists(edgeX86) ? edgeX86 : edge64;
        if (File.Exists(edge))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = edge,
                Arguments = "--app=\"" + AppUrl + "\" --start-maximized",
                UseShellExecute = true,
            });
            return;
        }
        Process.Start(new ProcessStartInfo { FileName = AppUrl, UseShellExecute = true });
    }
}
