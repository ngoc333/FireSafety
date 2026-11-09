using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;

var builder=Host.CreateApplicationBuilder(args);
builder.Services.AddHostedService<SyncWorker>();
await builder.Build().RunAsync();

sealed class SyncWorker : BackgroundService
{
    private readonly HttpClient http=new() { Timeout=TimeSpan.FromSeconds(25) };
    private readonly string supabase=Environment.GetEnvironmentVariable("SUPABASE_URL")?.TrimEnd('/')
        ?? throw new InvalidOperationException("SUPABASE_URL required");
    private readonly string key=Environment.GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        ?? throw new InvalidOperationException("SUPABASE_SERVICE_ROLE_KEY required");
    private readonly string pg=Environment.GetEnvironmentVariable("FIRE_SAFETY_PG_CONNECTION")
        ?? throw new InvalidOperationException("FIRE_SAFETY_PG_CONNECTION required");

    public SyncWorker()
    {
        // Service role must only run on the trusted LAN worker, never in browser.
        http.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",key);
        http.DefaultRequestHeaders.Add("apikey",key);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while(!stoppingToken.IsCancellationRequested)
        {
            try { await PullEvents(stoppingToken); await PushSnapshot(stoppingToken); }
            catch(Exception ex) { Console.Error.WriteLine($"{DateTimeOffset.UtcNow:o} Sync error: {ex.Message}"); }
            await Task.Delay(TimeSpan.FromSeconds(30),stoppingToken);
        }
    }

    private async Task PullEvents(CancellationToken ct)
    {
        // Client writes are first acknowledged by Supabase, then imported to local PG.
        var url=supabase+"/rest/v1/fs_events?select=id,kind,payload&processed_at=is.null&order=created_at.asc&limit=100";
        var events=await http.GetFromJsonAsync<JsonElement>(url,ct);
        foreach(var ev in events.EnumerateArray())
        {
            var id=ev.GetProperty("id").GetGuid();
            var kind=ev.GetProperty("kind").GetString()!;
            var payload=ev.GetProperty("payload").GetRawText();
            // Database function MUST be implemented transactionally and idempotently:
            // it records event UUID and performs business update in one PG transaction.
            await using(var conn=new NpgsqlConnection(pg))
            {
                await conn.OpenAsync(ct);
                await using var cmd=new NpgsqlCommand("select firesafety_import_event(@id,@kind,@payload::jsonb)",conn);
                cmd.Parameters.AddWithValue("id",id);
                cmd.Parameters.AddWithValue("kind",kind);
                cmd.Parameters.AddWithValue("payload",payload);
                await cmd.ExecuteScalarAsync(ct);
            }
            var patch=new HttpRequestMessage(HttpMethod.Patch,supabase+"/rest/v1/fs_events?id=eq."+id);
            patch.Headers.Add("Prefer","return=minimal");
            patch.Content=JsonContent.Create(new { processed_at=DateTimeOffset.UtcNow,error_message=(string?)null });
            using var response=await http.SendAsync(patch,ct);
            response.EnsureSuccessStatusCode();
        }
    }

    private async Task PushSnapshot(CancellationToken ct)
    {
        // Local SQL integration contract is documented in worker/README.md.
        // One row per owner_uid + key + table_name; export is a VIEW with JSONB data.
        await using var conn=new NpgsqlConnection(pg);
        await conn.OpenAsync(ct);
        await using var cmd=new NpgsqlCommand(
            "select owner_uid, table_name, record_key, data from firesafety_cloud_export",conn);
        await using var reader=await cmd.ExecuteReaderAsync(ct);
        while(await reader.ReadAsync(ct))
        {
            var uid=reader.GetGuid(0);
            var table=reader.GetString(1);
            if(!new[]{"fs_locations","fs_items","fs_countermeasures","fs_schedules","fs_repairs"}.Contains(table))
                throw new InvalidOperationException("Invalid export table");
            var recordKey=reader.GetString(2);
            var data=JsonDocument.Parse(reader.GetString(3)).RootElement.Clone();
            // Upsert: unique(owner_uid,key), repeat-safe.
            var req=new HttpRequestMessage(HttpMethod.Post,supabase+"/rest/v1/"+table+"?on_conflict=owner_uid,key");
            req.Headers.Add("Prefer","resolution=merge-duplicates,return=minimal");
            req.Content=JsonContent.Create(new {owner_uid=uid,key=recordKey,data});
            using var response=await http.SendAsync(req,ct);
            response.EnsureSuccessStatusCode();
        }
    }
}
