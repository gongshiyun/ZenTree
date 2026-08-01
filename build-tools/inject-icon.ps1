param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$IcoPath
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class ZenTreeIconInjector {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern IntPtr BeginUpdateResource(string pFileName, bool bDeleteExistingResources);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool UpdateResource(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLanguage, byte[] lpData, uint cbData);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool EndUpdateResource(IntPtr hUpdate, bool fDiscard);

  static readonly IntPtr RT_ICON = (IntPtr)3;
  static readonly IntPtr RT_GROUP_ICON = (IntPtr)14;

  public static string Inject(string exePath, string icoPath, int baseIconId) {
    byte[] ico = File.ReadAllBytes(icoPath);
    int count = BitConverter.ToUInt16(ico, 4);
    if (count == 0) return "ICO has no frames";
    byte[] sizes = new byte[count];
    byte[][] dataArr = new byte[count][];
    for (int i = 0; i < count; i++) {
      int o = 6 + i * 16;
      sizes[i] = ico[o];
      uint size = BitConverter.ToUInt32(ico, o + 8);
      int offset = BitConverter.ToInt32(ico, o + 12);
      dataArr[i] = new byte[size];
      Array.Copy(ico, offset, dataArr[i], 0, (int)size);
    }
    byte[] group = new byte[6 + count * 14];
    group[2] = 1; group[3] = 0;
    group[4] = (byte)count; group[5] = 0;
    for (int i = 0; i < count; i++) {
      int o = 6 + i * 14;
      int eo = 6 + i * 16;
      group[o] = sizes[i];
      group[o + 1] = ico[eo + 1];
      group[o + 2] = ico[eo + 2];
      group[o + 3] = 0;
      group[o + 4] = ico[eo + 4];
      group[o + 5] = ico[eo + 5];
      group[o + 6] = ico[eo + 6];
      group[o + 7] = ico[eo + 7];
      uint size = BitConverter.ToUInt32(ico, eo + 8);
      group[o + 8] = (byte)(size & 0xFF);
      group[o + 9] = (byte)((size >> 8) & 0xFF);
      group[o + 10] = (byte)((size >> 16) & 0xFF);
      group[o + 11] = (byte)((size >> 24) & 0xFF);
      int id = baseIconId + i;
      group[o + 12] = (byte)(id & 0xFF);
      group[o + 13] = (byte)((id >> 8) & 0xFF);
    }
    ushort lang = 0x0409;
    IntPtr hUpd = BeginUpdateResource(exePath, false);
    if (hUpd == IntPtr.Zero) return "BeginUpdateResource failed: " + Marshal.GetLastWin32Error();
    string err = null;
    for (int i = 0; i < count; i++) {
      int id = baseIconId + i;
      if (!UpdateResource(hUpd, RT_ICON, (IntPtr)id, lang, dataArr[i], (uint)dataArr[i].Length)) {
        err = "UpdateResource RT_ICON " + id + " failed: " + Marshal.GetLastWin32Error();
        break;
      }
    }
    if (err == null && !UpdateResource(hUpd, RT_GROUP_ICON, (IntPtr)1, lang, group, (uint)group.Length))
      err = "UpdateResource RT_GROUP_ICON failed: " + Marshal.GetLastWin32Error();
    if (!EndUpdateResource(hUpd, false))
      return (err != null ? err + " | " : "") + "EndUpdateResource failed: " + Marshal.GetLastWin32Error();
    return err ?? "OK";
  }
}
'@

$result = [ZenTreeIconInjector]::Inject((Resolve-Path $ExePath).Path, (Resolve-Path $IcoPath).Path, 100)
Write-Output "inject $ExePath => $result"
if ($result -ne "OK") { exit 1 }
