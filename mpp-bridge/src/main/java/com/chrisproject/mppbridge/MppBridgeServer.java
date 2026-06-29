package com.chrisproject.mppbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Local MPXJ bridge for true .mpp ingest.
 *
 * This deliberately exports neutral JSON instead of XML so the browser app can keep
 * its existing schedule engine, Gantt UI, validation, and compatibility scorecard.
 */
public final class MppBridgeServer {
  private static final int DEFAULT_PORT = 3908;
  private static final ObjectMapper JSON = new ObjectMapper();

  public static void main(String[] args) throws Exception {
    if (args.length >= 2 && !"server".equalsIgnoreCase(args[0])) {
      Map<String, Object> converted = convert(Path.of(args[0]), args[0]);
      Files.writeString(Path.of(args[1]), JSON.writerWithDefaultPrettyPrinter().writeValueAsString(converted), StandardCharsets.UTF_8);
      System.out.println("Wrote " + args[1]);
      return;
    }

    int port = args.length >= 2 && "server".equalsIgnoreCase(args[0]) ? Integer.parseInt(args[1]) : DEFAULT_PORT;
    startServer(port);
  }

  private static void startServer(int port) throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
    server.createContext("/health", MppBridgeServer::health);
    server.createContext("/convert-mpp", MppBridgeServer::convertMpp);
    server.setExecutor(null);
    server.start();
    System.out.println("MPXJ bridge listening at http://127.0.0.1:" + port);
  }

  private static void health(HttpExchange exchange) throws IOException {
    withCors(exchange);
    if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
      send(exchange, 204, "");
      return;
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("engine", "mpxj");
    out.put("bridgeVersion", "0.1.0");
    sendJson(exchange, 200, out);
  }

  private static void convertMpp(HttpExchange exchange) throws IOException {
    withCors(exchange);
    if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
      send(exchange, 204, "");
      return;
    }
    if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
      sendJson(exchange, 405, error("Use POST /convert-mpp with the raw .mpp bytes as the request body."));
      return;
    }

    Path temp = Files.createTempFile("chrisproject-mpxj-", ".mpp");
    try {
      Files.write(temp, exchange.getRequestBody().readAllBytes());
      String name = firstHeader(exchange.getRequestHeaders(), "X-File-Name", "project.mpp");
      sendJson(exchange, 200, convert(temp, name));
    } catch (Exception error) {
      sendJson(exchange, 500, error(error.getMessage() == null ? String.valueOf(error) : error.getMessage()));
    } finally {
      try { Files.deleteIfExists(temp); } catch (IOException ignored) {}
    }
  }

  private static Map<String, Object> convert(Path file, String sourceName) throws Exception {
    Object reader = Class.forName("org.mpxj.reader.UniversalProjectReader").getDeclaredConstructor().newInstance();
    Object project = reader.getClass().getMethod("read", String.class).invoke(reader, file.toString());

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", true);
    out.put("engine", "mpxj");
    out.put("bridgeVersion", "0.1.0");
    out.put("sourceFile", sourceName);
    out.put("project", exportProject(project));
    return out;
  }

  private static Map<String, Object> exportProject(Object project) {
    Map<String, Object> out = new LinkedHashMap<>();
    Object props = call(project, "getProjectProperties");
    out.put("name", string(firstNonBlank(
      call(props, "getProjectTitle"),
      call(props, "getName"),
      call(props, "getSubject")
    ), "Imported MPP"));
    out.put("start", date(firstNonBlank(call(props, "getStartDate"), call(props, "getProjectStart"))));
    out.put("finish", date(firstNonBlank(call(props, "getFinishDate"), call(props, "getProjectFinish"))));

    List<Map<String, Object>> tasks = exportTasks(project);
    List<Map<String, Object>> resources = exportResources(project);
    List<Map<String, Object>> assignments = exportAssignments(project);
    List<Map<String, Object>> calendars = exportCalendars(project);

    out.put("tasks", tasks);
    out.put("resources", resources);
    out.put("assignments", assignments);
    out.put("calendars", calendars);
    out.put("diagnostics", Map.of(
      "taskCount", tasks.size(),
      "resourceCount", resources.size(),
      "assignmentCount", assignments.size(),
      "calendarCount", calendars.size()
    ));
    return out;
  }

  private static List<Map<String, Object>> exportTasks(Object project) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object task : asList(call(project, "getTasks"))) {
      if (task == null) continue;
      Integer id = number(firstNonBlank(call(task, "getID"), call(task, "getId")));
      Integer uid = number(firstNonBlank(call(task, "getUniqueID"), call(task, "getUniqueId"), id));
      String name = string(call(task, "getName"), "").trim();
      if (name.isEmpty() && (id == null || id == 0)) continue;

      Map<String, Object> row = new LinkedHashMap<>();
      row.put("id", id);
      row.put("uid", uid);
      row.put("name", name.isEmpty() ? "Task " + (out.size() + 1) : name);
      row.put("start", date(call(task, "getStart")));
      row.put("finish", date(call(task, "getFinish")));
      row.put("duration", string(call(task, "getDuration"), ""));
      row.put("durationMinutes", durationMinutes(call(task, "getDuration")));
      row.put("percent", number(firstNonBlank(call(task, "getPercentageComplete"), call(task, "getPercentComplete"))));
      row.put("outlineLevel", number(firstNonBlank(call(task, "getOutlineLevel"), 1)));
      row.put("summary", bool(call(task, "getSummary")) || bool(call(task, "getSummaryTask")));
      row.put("milestone", bool(call(task, "getMilestone")));
      row.put("notes", string(call(task, "getNotes"), ""));
      row.put("predecessors", exportRelations(task));
      row.put("actualStart", date(call(task, "getActualStart")));
      row.put("actualFinish", date(call(task, "getActualFinish")));
      row.put("baselineStart", date(firstNonBlank(call(task, "getBaselineStart"), call(task, "getBaselineStart0"))));
      row.put("baselineFinish", date(firstNonBlank(call(task, "getBaselineFinish"), call(task, "getBaselineFinish0"))));
      out.add(row);
    }
    return out;
  }

  private static List<Map<String, Object>> exportRelations(Object task) {
    List<Map<String, Object>> out = new ArrayList<>();
    Object raw = firstNonBlank(call(task, "getPredecessors"), call(task, "getPredecessorTasks"));
    for (Object rel : asList(raw)) {
      Object source = firstNonBlank(
        call(rel, "getSourceTask"),
        call(rel, "getTargetTask"),
        call(rel, "getTask"),
        call(rel, "getPredecessorTask")
      );
      Integer predUid = number(firstNonBlank(call(source, "getUniqueID"), call(source, "getUniqueId"), call(source, "getID")));
      if (predUid == null || predUid == 0) continue;
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("predecessorUid", predUid);
      item.put("type", relationType(call(rel, "getType")));
      item.put("lag", string(call(rel, "getLag"), ""));
      item.put("lagMinutes", durationMinutes(call(rel, "getLag")));
      out.add(item);
    }
    return out;
  }

  private static List<Map<String, Object>> exportResources(Object project) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object resource : asList(call(project, "getResources"))) {
      String name = string(call(resource, "getName"), "").trim();
      Integer uid = number(firstNonBlank(call(resource, "getUniqueID"), call(resource, "getUniqueId"), call(resource, "getID")));
      if (name.isEmpty() && (uid == null || uid == 0)) continue;
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("uid", uid);
      row.put("id", number(call(resource, "getID")));
      row.put("name", name.isEmpty() ? "Resource " + (out.size() + 1) : name);
      row.put("type", string(call(resource, "getType"), "Work"));
      row.put("initials", string(call(resource, "getInitials"), ""));
      row.put("email", string(call(resource, "getEmailAddress"), ""));
      row.put("group", string(call(resource, "getGroup"), ""));
      row.put("maxUnits", number(call(resource, "getMaxUnits")));
      row.put("standardRate", string(call(resource, "getStandardRate"), ""));
      row.put("overtimeRate", string(call(resource, "getOvertimeRate"), ""));
      row.put("costPerUse", string(call(resource, "getCostPerUse"), ""));
      row.put("notes", string(call(resource, "getNotes"), ""));
      out.add(row);
    }
    return out;
  }

  private static List<Map<String, Object>> exportAssignments(Object project) {
    List<Map<String, Object>> out = new ArrayList<>();
    Object raw = firstNonBlank(call(project, "getResourceAssignments"), call(project, "getAssignments"));
    for (Object assignment : asList(raw)) {
      Object task = firstNonBlank(call(assignment, "getTask"), call(assignment, "getTaskUniqueID"));
      Object resource = firstNonBlank(call(assignment, "getResource"), call(assignment, "getResourceUniqueID"));
      Integer taskUid = number(firstNonBlank(call(task, "getUniqueID"), call(task, "getUniqueId"), task));
      Integer resourceUid = number(firstNonBlank(call(resource, "getUniqueID"), call(resource, "getUniqueId"), resource));
      if (taskUid == null || resourceUid == null || taskUid == 0 || resourceUid == 0) continue;
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("uid", number(firstNonBlank(call(assignment, "getUniqueID"), call(assignment, "getUniqueId"), out.size() + 1)));
      row.put("taskUid", taskUid);
      row.put("resourceUid", resourceUid);
      row.put("units", number(firstNonBlank(call(assignment, "getUnits"), call(assignment, "getAssignmentUnits"), 1)));
      row.put("workMinutes", durationMinutes(call(assignment, "getWork")));
      row.put("actualWorkMinutes", durationMinutes(call(assignment, "getActualWork")));
      row.put("remainingWorkMinutes", durationMinutes(call(assignment, "getRemainingWork")));
      out.add(row);
    }
    return out;
  }

  private static List<Map<String, Object>> exportCalendars(Object project) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object calendar : asList(firstNonBlank(call(project, "getCalendars"), call(project, "getBaseCalendars")))) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("uid", number(firstNonBlank(call(calendar, "getUniqueID"), call(calendar, "getUniqueId"), out.size() + 1)));
      row.put("name", string(call(calendar, "getName"), "Calendar " + (out.size() + 1)));
      out.add(row);
    }
    return out;
  }

  private static Object call(Object target, String method) {
    if (target == null || method == null) return null;
    try {
      Method m = target.getClass().getMethod(method);
      return m.invoke(target);
    } catch (Throwable ignored) {
      return null;
    }
  }

  private static Object firstNonBlank(Object... values) {
    for (Object value : values) {
      if (value == null) continue;
      if (value instanceof String && ((String) value).trim().isEmpty()) continue;
      return value;
    }
    return null;
  }

  private static List<Object> asList(Object value) {
    if (value == null) return List.of();
    if (value instanceof Collection<?>) return new ArrayList<>((Collection<?>) value);
    if (value instanceof Iterable<?>) {
      List<Object> out = new ArrayList<>();
      for (Object item : (Iterable<?>) value) out.add(item);
      return out;
    }
    if (value.getClass().isArray()) {
      List<Object> out = new ArrayList<>();
      int len = java.lang.reflect.Array.getLength(value);
      for (int i = 0; i < len; i++) out.add(java.lang.reflect.Array.get(value, i));
      return out;
    }
    return List.of(value);
  }

  private static Integer number(Object value) {
    if (value == null) return null;
    if (value instanceof Number) return ((Number) value).intValue();
    try { return (int) Math.round(Double.parseDouble(String.valueOf(value).replace("%", "").trim())); }
    catch (Exception ignored) { return null; }
  }

  private static boolean bool(Object value) {
    if (value instanceof Boolean) return (Boolean) value;
    return "true".equalsIgnoreCase(String.valueOf(value));
  }

  private static String string(Object value, String fallback) {
    return value == null ? fallback : String.valueOf(value);
  }

  private static String date(Object value) {
    if (value == null) return "";
    if (value instanceof TemporalAccessor) return String.valueOf(value).substring(0, Math.min(10, String.valueOf(value).length()));
    String text = String.valueOf(value);
    if (text.length() >= 10 && text.charAt(4) == '-' && text.charAt(7) == '-') return text.substring(0, 10);
    return text;
  }

  private static int durationMinutes(Object value) {
    if (value == null) return 0;
    Object duration = firstNonBlank(call(value, "getDuration"), call(value, "getValue"));
    if (duration instanceof Number) return (int) Math.round(((Number) duration).doubleValue() * 60.0);
    String text = String.valueOf(value);
    java.util.regex.Matcher iso = java.util.regex.Pattern.compile("P(?:T(?:(\\d+(?:\\.\\d+)?)H)?(?:(\\d+(?:\\.\\d+)?)M)?(?:(\\d+(?:\\.\\d+)?)S)?)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
    if (iso.find()) {
      double h = iso.group(1) == null ? 0 : Double.parseDouble(iso.group(1));
      double m = iso.group(2) == null ? 0 : Double.parseDouble(iso.group(2));
      double s = iso.group(3) == null ? 0 : Double.parseDouble(iso.group(3));
      return (int) Math.round(h * 60 + m + s / 60);
    }
    java.util.regex.Matcher simple = java.util.regex.Pattern.compile("(-?\\d+(?:\\.\\d+)?)\\s*(day|days|d|hour|hours|h|minute|minutes|min|m)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
    if (simple.find()) {
      double amount = Double.parseDouble(simple.group(1));
      String unit = simple.group(2).toLowerCase();
      if (unit.startsWith("d")) return (int) Math.round(amount * 480);
      if (unit.startsWith("h")) return (int) Math.round(amount * 60);
      return (int) Math.round(amount);
    }
    return 0;
  }

  private static String relationType(Object value) {
    String text = Objects.toString(value, "FS").toUpperCase();
    if (text.contains("START_START") || text.equals("SS")) return "SS";
    if (text.contains("FINISH_FINISH") || text.equals("FF")) return "FF";
    if (text.contains("START_FINISH") || text.equals("SF")) return "SF";
    return "FS";
  }

  private static void withCors(HttpExchange exchange) {
    Headers h = exchange.getResponseHeaders();
    h.set("Access-Control-Allow-Origin", "*");
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type,X-File-Name");
  }

  private static Map<String, Object> error(String message) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("ok", false);
    out.put("error", message);
    return out;
  }

  private static String firstHeader(Headers headers, String name, String fallback) {
    List<String> values = headers.get(name);
    return values == null || values.isEmpty() ? fallback : values.get(0);
  }

  private static void sendJson(HttpExchange exchange, int status, Object payload) throws IOException {
    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    send(exchange, status, JSON.writeValueAsString(payload));
  }

  private static void send(HttpExchange exchange, int status, String text) throws IOException {
    byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(status, status == 204 ? -1 : bytes.length);
    if (status != 204) {
      try (OutputStream out = exchange.getResponseBody()) {
        out.write(bytes);
      }
    }
  }
}
