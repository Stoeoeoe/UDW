using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Core.Tile.Vulcanus;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace Core.Tile.Editor.Vulcanus
{
    internal sealed class VulcanusProjectReimportWindow : EditorWindow
    {
        private const string FolderPrefsKey = "Core.Tile.Editor.Vulcanus.ProjectReimportWindow.Folder";

        private string _selectedFolder;
        private ScanSummary _summary;

        private TextField _folderField;
        private HelpBox _statusBox;
        private VisualElement _statsContainer;
        private VisualElement _summaryContainer;
        private Button _reimportAllButton;
        private Button _reimportProjectsButton;
        private Button _reimportMapsButton;
        private Button _reimportTilesetsButton;
        private Button _reimportItemsButton;

        [MenuItem("Tools/Vulcanus/Project Reimport Utility")]
        public static void OpenWindow()
        {
            var window = GetWindow<VulcanusProjectReimportWindow>();
            window.titleContent = new GUIContent("Vulcanus Reimport");
            window.minSize = new Vector2(820f, 560f);
        }

        public void CreateGUI()
        {
            _selectedFolder = EditorPrefs.GetString(FolderPrefsKey, string.Empty);
            BuildUi();

            if (!string.IsNullOrWhiteSpace(_selectedFolder))
                ScanSelectedFolder();
            else
                RefreshUi();
        }

        private void BuildUi()
        {
            var root = rootVisualElement;
            root.Clear();
            root.style.flexDirection = FlexDirection.Column;
            root.style.paddingLeft = 10;
            root.style.paddingRight = 10;
            root.style.paddingTop = 10;
            root.style.paddingBottom = 10;
            root.style.SetRowGap(8);

            root.Add(CreateHeader());

            _statusBox = new HelpBox(string.Empty, HelpBoxMessageType.Info);
            root.Add(_statusBox);

            root.Add(CreateActionBar());

            _statsContainer = new VisualElement();
            _statsContainer.style.flexDirection = FlexDirection.Row;
            _statsContainer.style.flexWrap = Wrap.Wrap;
            _statsContainer.style.SetColumnGap(8);
            _statsContainer.style.SetRowGap(8);
            root.Add(_statsContainer);

            var scrollView = new ScrollView(ScrollViewMode.Vertical);
            scrollView.style.flexGrow = 1f;
            root.Add(scrollView);

            _summaryContainer = new VisualElement();
            _summaryContainer.style.flexDirection = FlexDirection.Column;
            _summaryContainer.style.SetRowGap(12);
            scrollView.Add(_summaryContainer);
        }

        private VisualElement CreateHeader()
        {
            var container = new VisualElement();
            container.style.flexDirection = FlexDirection.Column;
            container.style.SetRowGap(6);

            var title = new Label("Scan a Vulcan project folder, review imported entities, and re-import selected sources.");
            title.style.whiteSpace = WhiteSpace.Normal;
            title.style.unityFontStyleAndWeight = FontStyle.Bold;
            container.Add(title);

            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.SetColumnGap(6);
            row.style.alignItems = Align.Center;

            _folderField = new TextField("Folder");
            _folderField.style.flexGrow = 1f;
            _folderField.isDelayed = true;
            _folderField.RegisterValueChangedCallback(evt =>
            {
                if (string.Equals(_selectedFolder, evt.newValue, StringComparison.OrdinalIgnoreCase))
                    return;

                SetSelectedFolder(evt.newValue, rescan: true);
            });
            row.Add(_folderField);

            var browseButton = new Button(SelectFolderFromDialog) { text = "Browse" };
            row.Add(browseButton);

            var selectionButton = new Button(UseSelectionFolder) { text = "Use Selection" };
            row.Add(selectionButton);

            var refreshButton = new Button(ScanSelectedFolder) { text = "Refresh" };
            row.Add(refreshButton);

            container.Add(row);
            return container;
        }

        private VisualElement CreateActionBar()
        {
            var container = new VisualElement();
            container.style.flexDirection = FlexDirection.Row;
            container.style.flexWrap = Wrap.Wrap;
            container.style.SetColumnGap(6);
            container.style.SetRowGap(6);

            _reimportAllButton = new Button(() => ReimportEntries(_summary != null ? _summary.Sources : null, "all sources"))
            {
                text = "Reimport All"
            };
            container.Add(_reimportAllButton);

            _reimportProjectsButton = new Button(() => ReimportEntries(FilterSources(SourceKind.Project), "project sources"))
            {
                text = "Reimport Projects"
            };
            container.Add(_reimportProjectsButton);

            _reimportMapsButton = new Button(() => ReimportEntries(FilterSources(SourceKind.Map), "map sources"))
            {
                text = "Reimport Maps"
            };
            container.Add(_reimportMapsButton);

            _reimportTilesetsButton = new Button(() => ReimportEntries(FilterSources(SourceKind.Tileset), "tileset sources"))
            {
                text = "Reimport Tilesets"
            };
            container.Add(_reimportTilesetsButton);

            _reimportItemsButton = new Button(() => ReimportEntries(FilterSources(SourceKind.Item), "item sources"))
            {
                text = "Reimport Items"
            };
            container.Add(_reimportItemsButton);

            return container;
        }

        private void SelectFolderFromDialog()
        {
            var initialFolder = Directory.Exists(_selectedFolder) ? _selectedFolder : Application.dataPath;
            var folder = EditorUtility.OpenFolderPanel("Select Vulcan project folder", initialFolder, string.Empty);
            if (string.IsNullOrWhiteSpace(folder))
                return;

            SetSelectedFolder(folder, rescan: true);
        }

        private void UseSelectionFolder()
        {
            var selectedObject = Selection.activeObject;
            if (selectedObject == null)
            {
                EditorUtility.DisplayDialog("Use Selection", "Select a folder in the Project window first.", "OK");
                return;
            }

            var assetPath = AssetDatabase.GetAssetPath(selectedObject);
            if (string.IsNullOrWhiteSpace(assetPath))
            {
                EditorUtility.DisplayDialog("Use Selection", "The current selection does not resolve to a project asset path.", "OK");
                return;
            }

            var folderAssetPath = AssetDatabase.IsValidFolder(assetPath)
                ? assetPath
                : Path.GetDirectoryName(assetPath)?.Replace('\\', '/');

            if (string.IsNullOrWhiteSpace(folderAssetPath))
            {
                EditorUtility.DisplayDialog("Use Selection", "Could not determine a folder from the current selection.", "OK");
                return;
            }

            SetSelectedFolder(VulcanusImportHelpers.ToAbsolutePath(folderAssetPath), rescan: true);
        }

        private void SetSelectedFolder(string folderPath, bool rescan)
        {
            _selectedFolder = NormalizePath(folderPath);
            EditorPrefs.SetString(FolderPrefsKey, _selectedFolder ?? string.Empty);
            _folderField.SetValueWithoutNotify(_selectedFolder ?? string.Empty);

            if (rescan)
                ScanSelectedFolder();
        }

        private void ScanSelectedFolder()
        {
            _summary = ScanFolder(_selectedFolder);
            RefreshUi();
        }

        private void RefreshUi()
        {
            RefreshStatus();
            RefreshActions();
            RefreshStats();
            RefreshSummarySections();
        }

        private void RefreshStatus()
        {
            if (string.IsNullOrWhiteSpace(_selectedFolder))
            {
                _statusBox.text = "Choose a folder to scan for Vulcan source files.";
                _statusBox.messageType = HelpBoxMessageType.Info;
                return;
            }

            if (_summary == null)
            {
                _statusBox.text = "No scan data available.";
                _statusBox.messageType = HelpBoxMessageType.Warning;
                return;
            }

            if (_summary.Errors.Count > 0)
            {
                _statusBox.text = string.Join("\n", _summary.Errors);
                _statusBox.messageType = HelpBoxMessageType.Error;
                return;
            }

            var messages = new List<string>();

            if (!_summary.IsImportableFolder)
                messages.Add("Folder is outside the Unity Assets directory. Scan works, but re-import actions are disabled for files outside Assets.");

            if (_summary.Warnings.Count > 0)
                messages.AddRange(_summary.Warnings);

            if (messages.Count == 0)
            {
                _statusBox.text = "Scan complete.";
                _statusBox.messageType = HelpBoxMessageType.Info;
                return;
            }

            _statusBox.text = string.Join("\n", messages);
            _statusBox.messageType = _summary.IsImportableFolder ? HelpBoxMessageType.Warning : HelpBoxMessageType.Info;
        }

        private void RefreshActions()
        {
            SetButtonState(_reimportAllButton, _summary != null && _summary.ImportableSourceCount > 0);
            SetButtonState(_reimportProjectsButton, CountImportableSources(SourceKind.Project) > 0);
            SetButtonState(_reimportMapsButton, CountImportableSources(SourceKind.Map) > 0);
            SetButtonState(_reimportTilesetsButton, CountImportableSources(SourceKind.Tileset) > 0);
            SetButtonState(_reimportItemsButton, CountImportableSources(SourceKind.Item) > 0);
        }

        private void RefreshStats()
        {
            _statsContainer.Clear();

            if (_summary == null)
                return;

            _statsContainer.Add(CreateStatCard("Sources", _summary.Sources.Count.ToString()));
            _statsContainer.Add(CreateStatCard("Importable", _summary.ImportableSourceCount.ToString()));
            _statsContainer.Add(CreateStatCard("Projects", _summary.ProjectCount.ToString()));
            _statsContainer.Add(CreateStatCard("Maps", _summary.Maps.Count.ToString()));
            _statsContainer.Add(CreateStatCard("Tilesets", _summary.CountByKind(SourceKind.Tileset).ToString()));
            _statsContainer.Add(CreateStatCard("Items", _summary.CountByKind(SourceKind.Item).ToString()));
            _statsContainer.Add(CreateStatCard("Entity Types", _summary.Entities.Count.ToString()));
            _statsContainer.Add(CreateStatCard("Placed Entities", _summary.TotalEntityInstances.ToString()));
        }

        private void RefreshSummarySections()
        {
            _summaryContainer.Clear();

            if (_summary == null)
                return;

            _summaryContainer.Add(CreateOverviewSection());
            _summaryContainer.Add(CreateSourcesSection());
            _summaryContainer.Add(CreateEntitiesSection());
            _summaryContainer.Add(CreateMapsSection());
        }

        private VisualElement CreateOverviewSection()
        {
            var section = CreateSection("Overview", _summary.ProjectDisplayName);
            var content = GetSectionContent(section);

            AddBodyLabel(content, $"Folder: {_summary.FolderPath}");
            AddBodyLabel(content, $"Source files: {_summary.Sources.Count} total, {_summary.ImportableSourceCount} importable inside Assets.");
            AddBodyLabel(content, $"Entity types discovered: {_summary.Entities.Count}. Placed instances found across maps: {_summary.TotalEntityInstances}.");

            if (!string.IsNullOrWhiteSpace(_summary.PrimaryProjectId))
                AddBodyLabel(content, $"Project id: {_summary.PrimaryProjectId}");

            return section;
        }

        private VisualElement CreateSourcesSection()
        {
            var section = CreateSection("Source Files", $"{_summary.Sources.Count} discovered");
            var content = GetSectionContent(section);

            if (_summary.Sources.Count == 0)
            {
                AddBodyLabel(content, "No .vproj, .vmap, .vts, or .vitm files were found in this folder.");
                return section;
            }

            foreach (var source in _summary.Sources)
                content.Add(CreateSourceRow(source));

            return section;
        }

        private VisualElement CreateEntitiesSection()
        {
            var section = CreateSection("Entities", $"{_summary.Entities.Count} types");
            var content = GetSectionContent(section);

            if (_summary.Entities.Count == 0)
            {
                AddBodyLabel(content, "No entity definitions or placed entity instances were found.");
                return section;
            }

            foreach (var entity in _summary.Entities)
                content.Add(CreateEntityRow(entity));

            return section;
        }

        private VisualElement CreateMapsSection()
        {
            var section = CreateSection("Maps", $"{_summary.Maps.Count} discovered");
            var content = GetSectionContent(section);

            if (_summary.Maps.Count == 0)
            {
                AddBodyLabel(content, "No map source files were found.");
                return section;
            }

            foreach (var map in _summary.Maps)
                content.Add(CreateMapRow(map));

            return section;
        }

        private VisualElement CreateSourceRow(SourceEntry source)
        {
            var row = CreateRowContainer();
            var left = CreateRowTextContainer();

            AddPrimaryLabel(left, $"{source.KindLabel}: {source.RelativePath}");
            AddBodyLabel(left, source.SummaryText);
            AddMutedLabel(left, source.Importable
                ? $"Asset path: {source.AssetPath}"
                : "Outside Assets: scan only");

            row.Add(left);
            row.Add(CreateRowActionButton("Reimport", source.Importable, () => ReimportEntries(new[] { source }, source.RelativePath)));
            return row;
        }

        private VisualElement CreateEntityRow(EntitySummary entity)
        {
            var row = CreateRowContainer();
            var left = CreateRowTextContainer();

            var heading = string.IsNullOrWhiteSpace(entity.DisplayName) || string.Equals(entity.DisplayName, entity.TypeId, StringComparison.OrdinalIgnoreCase)
                ? entity.TypeId
                : $"{entity.DisplayName} ({entity.TypeId})";

            AddPrimaryLabel(left, heading);
            AddBodyLabel(left, $"Instances: {entity.InstanceCount} across {entity.MapCount} map(s). Category: {entity.CategoryDisplay}. Group: {entity.GroupDisplay}.");
            AddMutedLabel(left, entity.PrefabMapped
                ? $"Mapped prefab: {entity.PrefabName}"
                : "Mapped prefab: none");

            if (entity.MapNames.Count > 0)
                AddMutedLabel(left, $"Maps: {FormatListPreview(entity.MapNames)}");

            row.Add(left);
            row.Add(CreateRowActionButton("Reimport Sources", entity.ImportableSources.Count > 0,
                () => ReimportEntries(entity.ImportableSources, $"sources for entity '{entity.TypeId}'")));
            return row;
        }

        private VisualElement CreateMapRow(MapSummary map)
        {
            var row = CreateRowContainer();
            var left = CreateRowTextContainer();

            AddPrimaryLabel(left, $"{map.MapName} ({map.MapId})");
            AddBodyLabel(left, $"{map.Width}x{map.Height}, {map.EntityCount} placed entities, {map.UniqueEntityTypeCount} unique type(s).");
            AddMutedLabel(left, $"Source: {map.RelativePath}");

            if (map.EntityTypeIds.Count > 0)
                AddMutedLabel(left, $"Types: {FormatListPreview(map.EntityTypeIds)}");

            row.Add(left);
            row.Add(CreateRowActionButton("Reimport", map.Source.Importable,
                () => ReimportEntries(new[] { map.Source }, $"map '{map.MapId}'")));
            return row;
        }

        private static VisualElement CreateSection(string title, string subtitle)
        {
            var container = new VisualElement();
            container.style.paddingLeft = 10;
            container.style.paddingRight = 10;
            container.style.paddingTop = 8;
            container.style.paddingBottom = 10;
            container.style.borderTopWidth = 1;
            container.style.borderBottomWidth = 1;
            container.style.borderLeftWidth = 1;
            container.style.borderRightWidth = 1;
            container.style.borderTopColor = new Color(0.25f, 0.25f, 0.25f);
            container.style.borderBottomColor = new Color(0.25f, 0.25f, 0.25f);
            container.style.borderLeftColor = new Color(0.25f, 0.25f, 0.25f);
            container.style.borderRightColor = new Color(0.25f, 0.25f, 0.25f);
            container.style.backgroundColor = new Color(0.18f, 0.18f, 0.18f, 0.25f);
            container.style.SetRowGap(8);

            var header = new VisualElement();
            header.style.flexDirection = FlexDirection.Row;
            header.style.justifyContent = Justify.SpaceBetween;
            header.style.alignItems = Align.Center;
            container.Add(header);

            var titleLabel = new Label(title);
            titleLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            header.Add(titleLabel);

            if (!string.IsNullOrWhiteSpace(subtitle))
            {
                var subtitleLabel = new Label(subtitle);
                subtitleLabel.style.color = new Color(0.75f, 0.75f, 0.75f);
                header.Add(subtitleLabel);
            }

            var content = new VisualElement();
            content.name = "content";
            content.style.flexDirection = FlexDirection.Column;
            content.style.SetRowGap(6);
            container.Add(content);
            return container;
        }

        private static VisualElement GetSectionContent(VisualElement section)
        {
            return section.Q<VisualElement>("content");
        }

        private static VisualElement CreateStatCard(string title, string value)
        {
            var card = new VisualElement();
            card.style.minWidth = 104;
            card.style.paddingLeft = 10;
            card.style.paddingRight = 10;
            card.style.paddingTop = 8;
            card.style.paddingBottom = 8;
            card.style.backgroundColor = new Color(0.18f, 0.18f, 0.18f, 0.25f);
            card.style.borderTopWidth = 1;
            card.style.borderBottomWidth = 1;
            card.style.borderLeftWidth = 1;
            card.style.borderRightWidth = 1;
            card.style.borderTopColor = new Color(0.25f, 0.25f, 0.25f);
            card.style.borderBottomColor = new Color(0.25f, 0.25f, 0.25f);
            card.style.borderLeftColor = new Color(0.25f, 0.25f, 0.25f);
            card.style.borderRightColor = new Color(0.25f, 0.25f, 0.25f);

            var valueLabel = new Label(value);
            valueLabel.style.fontSize = 16;
            valueLabel.style.unityFontStyleAndWeight = FontStyle.Bold;
            card.Add(valueLabel);

            var titleLabel = new Label(title);
            titleLabel.style.color = new Color(0.75f, 0.75f, 0.75f);
            card.Add(titleLabel);

            return card;
        }

        private static VisualElement CreateRowContainer()
        {
            var row = new VisualElement();
            row.style.flexDirection = FlexDirection.Row;
            row.style.justifyContent = Justify.SpaceBetween;
            row.style.alignItems = Align.Center;
            row.style.SetColumnGap(8);
            row.style.paddingLeft = 8;
            row.style.paddingRight = 8;
            row.style.paddingTop = 6;
            row.style.paddingBottom = 6;
            row.style.backgroundColor = new Color(0.18f, 0.18f, 0.18f, 0.15f);
            return row;
        }

        private static VisualElement CreateRowTextContainer()
        {
            var container = new VisualElement();
            container.style.flexGrow = 1f;
            container.style.flexDirection = FlexDirection.Column;
            container.style.SetRowGap(2);
            return container;
        }

        private static Button CreateRowActionButton(string text, bool enabled, Action onClick)
        {
            var button = new Button(onClick) { text = text };
            button.style.minWidth = 120;
            button.SetEnabled(enabled);
            return button;
        }

        private static void AddPrimaryLabel(VisualElement parent, string text)
        {
            var label = new Label(text);
            label.style.unityFontStyleAndWeight = FontStyle.Bold;
            label.style.whiteSpace = WhiteSpace.Normal;
            parent.Add(label);
        }

        private static void AddBodyLabel(VisualElement parent, string text)
        {
            var label = new Label(text);
            label.style.whiteSpace = WhiteSpace.Normal;
            parent.Add(label);
        }

        private static void AddMutedLabel(VisualElement parent, string text)
        {
            var label = new Label(text);
            label.style.whiteSpace = WhiteSpace.Normal;
            label.style.color = new Color(0.72f, 0.72f, 0.72f);
            parent.Add(label);
        }

        private void ReimportEntries(IEnumerable<SourceEntry> entries, string label)
        {
            var importableEntries = entries?
                .Where(entry => entry != null && entry.Importable)
                .GroupBy(entry => entry.AssetPath, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .OrderBy(entry => entry.AssetPath, StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (importableEntries == null || importableEntries.Count == 0)
            {
                EditorUtility.DisplayDialog("Reimport", $"No importable sources were found for {label}.", "OK");
                return;
            }

            try
            {
                AssetDatabase.StartAssetEditing();
                foreach (var entry in importableEntries)
                    AssetDatabase.ImportAsset(entry.AssetPath, ImportAssetOptions.ForceUpdate);
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.Refresh();
            }

            Debug.Log($"[VulcanusProjectReimportWindow] Reimported {importableEntries.Count} source(s) for {label}.");
            ScanSelectedFolder();
        }

        private IReadOnlyList<SourceEntry> FilterSources(SourceKind kind)
        {
            if (_summary == null)
                return Array.Empty<SourceEntry>();

            return _summary.Sources.Where(source => source.Kind == kind).ToArray();
        }

        private int CountImportableSources(SourceKind kind)
        {
            return FilterSources(kind).Count(source => source.Importable);
        }

        private static void SetButtonState(Button button, bool enabled)
        {
            if (button != null)
                button.SetEnabled(enabled);
        }

        private static string FormatListPreview(IReadOnlyList<string> items)
        {
            if (items == null || items.Count == 0)
                return "None";

            const int previewCount = 5;
            if (items.Count <= previewCount)
                return string.Join(", ", items);

            return string.Join(", ", items.Take(previewCount)) + $", +{items.Count - previewCount} more";
        }

        private static ScanSummary ScanFolder(string folderPath)
        {
            var summary = new ScanSummary();
            summary.FolderPath = NormalizePath(folderPath);

            if (string.IsNullOrWhiteSpace(summary.FolderPath))
                return summary;

            if (!Directory.Exists(summary.FolderPath))
            {
                summary.Errors.Add($"Folder does not exist: {summary.FolderPath}");
                return summary;
            }

            summary.IsImportableFolder = VulcanusImportHelpers.TryAbsoluteToAssetPath(summary.FolderPath, out _);

            var entityBuilders = new Dictionary<string, EntitySummaryBuilder>(StringComparer.OrdinalIgnoreCase);
            var files = Directory.GetFiles(summary.FolderPath, "*.*", SearchOption.AllDirectories)
                .Where(IsSupportedSourceFile)
                .OrderBy(GetSourceSortKey, StringComparer.OrdinalIgnoreCase)
                .ThenBy(path => path, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            foreach (var filePath in files)
            {
                var source = SourceEntry.Create(filePath, summary.FolderPath);
                summary.Sources.Add(source);

                try
                {
                    switch (source.Kind)
                    {
                        case SourceKind.Project:
                            ScanProjectSource(summary, source, entityBuilders);
                            break;

                        case SourceKind.Map:
                            ScanMapSource(summary, source, entityBuilders);
                            break;

                        case SourceKind.Tileset:
                            ScanTilesetSource(source);
                            break;

                        case SourceKind.Item:
                            ScanItemSource(source);
                            break;
                    }
                }
                catch (Exception ex)
                {
                    source.SummaryText = $"Failed to read source file: {ex.Message}";
                    summary.Warnings.Add($"Could not parse '{source.RelativePath}': {ex.Message}");
                }
            }

            foreach (var builder in entityBuilders.Values)
                summary.Entities.Add(builder.Build());

            summary.Entities.Sort((left, right) =>
            {
                var countComparison = right.InstanceCount.CompareTo(left.InstanceCount);
                return countComparison != 0
                    ? countComparison
                    : string.Compare(left.TypeId, right.TypeId, StringComparison.OrdinalIgnoreCase);
            });

            summary.Maps.Sort((left, right) => string.Compare(left.MapName, right.MapName, StringComparison.OrdinalIgnoreCase));
            ApplyPrefabMappings(summary);

            if (summary.ProjectCount == 0)
                summary.Warnings.Add("No .vproj file was found in the selected folder.");

            return summary;
        }

        private static void ScanProjectSource(
            ScanSummary summary,
            SourceEntry source,
            Dictionary<string, EntitySummaryBuilder> entityBuilders)
        {
            var dto = VulcanusImportHelpers.LoadDto<ProjectDto>(source.AbsolutePath);
            summary.ProjectCount++;

            if (string.IsNullOrWhiteSpace(summary.PrimaryProjectId))
            {
                summary.PrimaryProjectId = dto.Id;
                summary.PrimaryProjectName = dto.Name;
                summary.PrimaryProjectSource = source;
            }

            source.SummaryText = $"{dto.EntityTypes.Count} entity type(s), {dto.LayerDefinitions.Count} layer(s), {dto.TerrainTypes.Count} terrain type(s).";

            foreach (var entityType in dto.EntityTypes ?? new List<EntityTypeDto>())
            {
                if (string.IsNullOrWhiteSpace(entityType.Id))
                    continue;

                var builder = GetOrCreateEntityBuilder(entityBuilders, entityType.Id);
                builder.DisplayName = FirstNonEmpty(builder.DisplayName, entityType.DisplayName, entityType.Id);
                builder.Category = FirstNonEmpty(builder.Category, entityType.Category, "Uncategorized");
                builder.Group = FirstNonEmpty(builder.Group, entityType.Group, "Ungrouped");
                builder.HasDefinition = true;
                builder.TryAddImportSource(source);
            }
        }

        private static void ScanMapSource(
            ScanSummary summary,
            SourceEntry source,
            Dictionary<string, EntitySummaryBuilder> entityBuilders)
        {
            var dto = VulcanusImportHelpers.LoadDto<MapDto>(source.AbsolutePath);
            var mapId = !string.IsNullOrWhiteSpace(dto.Id) ? dto.Id : VulcanusImportHelpers.GetBaseName(source.AbsolutePath);
            var mapName = !string.IsNullOrWhiteSpace(dto.Name) ? dto.Name : mapId;
            var instances = EnumerateEntities(dto).ToArray();
            var entityTypeIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var instance in instances)
            {
                var typeId = string.IsNullOrWhiteSpace(instance.TypeId) ? "(missing typeId)" : instance.TypeId;
                entityTypeIds.Add(typeId);

                var builder = GetOrCreateEntityBuilder(entityBuilders, typeId);
                builder.InstanceCount++;
                builder.MapNames.Add(mapName);
                builder.TryAddImportSource(source);
                if (string.IsNullOrWhiteSpace(builder.DisplayName))
                    builder.DisplayName = typeId;
            }

            source.EntityCount = instances.Length;
            source.SummaryText = $"{instances.Length} placed entit{(instances.Length == 1 ? "y" : "ies")}, {dto.Layers.Count} layer(s), {dto.Width}x{dto.Height}.";
            summary.TotalEntityInstances += instances.Length;
            summary.Maps.Add(new MapSummary(mapId, mapName, dto.Width, dto.Height, entityTypeIds.OrderBy(id => id, StringComparer.OrdinalIgnoreCase).ToArray(), source));
        }

        private static void ScanTilesetSource(SourceEntry source)
        {
            var dto = VulcanusImportHelpers.LoadDto<TilesetDto>(source.AbsolutePath);
            source.SummaryText = $"{dto.TileCount} tile(s), sprite sheet: {dto.SpriteSheet ?? "none"}.";
        }

        private static void ScanItemSource(SourceEntry source)
        {
            var dto = VulcanusImportHelpers.LoadDto<ItemDto>(source.AbsolutePath);
            var itemName = !string.IsNullOrWhiteSpace(dto.Name) ? dto.Name : source.DisplayName;
            var classId = !string.IsNullOrWhiteSpace(dto.ClassId) ? dto.ClassId : "untyped";
            source.SummaryText = $"Item '{itemName}', class '{classId}', category '{dto.Category ?? "none"}'.";
        }

        private static IEnumerable<EntityInstanceDto> EnumerateEntities(MapDto map)
        {
            if (map == null)
                yield break;

            foreach (var entity in map.Entities ?? new List<EntityInstanceDto>())
                if (entity != null)
                    yield return entity;

            foreach (var layer in map.Layers ?? new List<LayerDto>())
            {
                foreach (var entity in layer.Entities ?? new List<EntityInstanceDto>())
                    if (entity != null)
                        yield return entity;
            }
        }

        private static void ApplyPrefabMappings(ScanSummary summary)
        {
            if (summary.PrimaryProjectSource == null || !summary.PrimaryProjectSource.Importable)
                return;

            var project = AssetDatabase.LoadAssetAtPath<VulcanusProject>(summary.PrimaryProjectSource.AssetPath);
            var catalog = VulcanusProjectRegistry.FindWorldCatalogForProject(summary.PrimaryProjectSource.AssetPath);
            if (project == null && catalog == null)
                return;

            foreach (var entity in summary.Entities)
            {
                GameObject prefab;
                if (catalog != null && catalog.TryGetEntityPrefab(entity.TypeId, out prefab) && prefab != null)
                {
                    entity.PrefabMapped = true;
                    entity.PrefabName = prefab.name;
                    continue;
                }

                if (project != null && project.TryGetEntityPrefab(entity.TypeId, out prefab) && prefab != null)
                {
                    entity.PrefabMapped = true;
                    entity.PrefabName = prefab.name;
                }
            }
        }

        private static EntitySummaryBuilder GetOrCreateEntityBuilder(
            IDictionary<string, EntitySummaryBuilder> builders,
            string typeId)
        {
            if (!builders.TryGetValue(typeId, out var builder))
            {
                builder = new EntitySummaryBuilder(typeId);
                builders.Add(typeId, builder);
            }

            return builder;
        }

        private static bool IsSupportedSourceFile(string filePath)
        {
            var extension = Path.GetExtension(filePath);
            return extension.Equals(".vproj", StringComparison.OrdinalIgnoreCase)
                   || extension.Equals(".vmap", StringComparison.OrdinalIgnoreCase)
                   || extension.Equals(".vts", StringComparison.OrdinalIgnoreCase)
                   || extension.Equals(".vitm", StringComparison.OrdinalIgnoreCase);
        }

        private static string GetSourceSortKey(string filePath)
        {
            switch (SourceEntry.GetKind(filePath))
            {
                case SourceKind.Project:
                    return "0";
                case SourceKind.Map:
                    return "1";
                case SourceKind.Tileset:
                    return "2";
                case SourceKind.Item:
                    return "3";
                default:
                    return "4";
            }
        }

        private static string FirstNonEmpty(params string[] values)
        {
            for (var i = 0; i < values.Length; i++)
            {
                if (!string.IsNullOrWhiteSpace(values[i]))
                    return values[i];
            }

            return string.Empty;
        }

        private static string NormalizePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return string.Empty;

            return Path.GetFullPath(path).Replace('\\', '/');
        }

        private sealed class ScanSummary
        {
            public string FolderPath;
            public string PrimaryProjectId;
            public string PrimaryProjectName;
            public bool IsImportableFolder;
            public int ProjectCount;
            public int TotalEntityInstances;
            public SourceEntry PrimaryProjectSource;
            public readonly List<SourceEntry> Sources = new();
            public readonly List<EntitySummary> Entities = new();
            public readonly List<MapSummary> Maps = new();
            public readonly List<string> Warnings = new();
            public readonly List<string> Errors = new();

            public int ImportableSourceCount => Sources.Count(source => source.Importable);

            public string ProjectDisplayName
            {
                get
                {
                    if (!string.IsNullOrWhiteSpace(PrimaryProjectName))
                        return PrimaryProjectName;

                    if (!string.IsNullOrWhiteSpace(PrimaryProjectId))
                        return PrimaryProjectId;

                    return "No project metadata loaded";
                }
            }

            public int CountByKind(SourceKind kind)
            {
                return Sources.Count(source => source.Kind == kind);
            }
        }

        private sealed class EntitySummaryBuilder
        {
            private readonly HashSet<string> _mapNames = new(StringComparer.OrdinalIgnoreCase);
            private readonly Dictionary<string, SourceEntry> _importableSources = new(StringComparer.OrdinalIgnoreCase);

            public EntitySummaryBuilder(string typeId)
            {
                TypeId = typeId;
            }

            public string TypeId { get; }
            public string DisplayName { get; set; }
            public string Category { get; set; }
            public string Group { get; set; }
            public int InstanceCount { get; set; }
            public bool HasDefinition { get; set; }
            public ISet<string> MapNames => _mapNames;

            public void TryAddImportSource(SourceEntry source)
            {
                if (source == null || !source.Importable || string.IsNullOrWhiteSpace(source.AssetPath))
                    return;

                if (!_importableSources.ContainsKey(source.AssetPath))
                    _importableSources.Add(source.AssetPath, source);
            }

            public EntitySummary Build()
            {
                return new EntitySummary(
                    TypeId,
                    string.IsNullOrWhiteSpace(DisplayName) ? TypeId : DisplayName,
                    string.IsNullOrWhiteSpace(Category) ? "Uncategorized" : Category,
                    string.IsNullOrWhiteSpace(Group) ? "Ungrouped" : Group,
                    InstanceCount,
                    _mapNames.OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray(),
                    _importableSources.Values.OrderBy(source => source.AssetPath, StringComparer.OrdinalIgnoreCase).ToArray());
            }
        }

        private sealed class EntitySummary
        {
            public EntitySummary(
                string typeId,
                string displayName,
                string category,
                string group,
                int instanceCount,
                IReadOnlyList<string> mapNames,
                IReadOnlyList<SourceEntry> importableSources)
            {
                TypeId = typeId;
                DisplayName = displayName;
                CategoryDisplay = category;
                GroupDisplay = group;
                InstanceCount = instanceCount;
                MapNames = mapNames;
                ImportableSources = importableSources;
            }

            public string TypeId { get; }
            public string DisplayName { get; }
            public string CategoryDisplay { get; }
            public string GroupDisplay { get; }
            public int InstanceCount { get; }
            public int MapCount => MapNames.Count;
            public IReadOnlyList<string> MapNames { get; }
            public IReadOnlyList<SourceEntry> ImportableSources { get; }
            public bool PrefabMapped { get; set; }
            public string PrefabName { get; set; }
        }

        private sealed class MapSummary
        {
            public MapSummary(string mapId, string mapName, int width, int height, IReadOnlyList<string> entityTypeIds, SourceEntry source)
            {
                MapId = mapId;
                MapName = mapName;
                Width = width;
                Height = height;
                EntityTypeIds = entityTypeIds;
                Source = source;
            }

            public string MapId { get; }
            public string MapName { get; }
            public int Width { get; }
            public int Height { get; }
            public int EntityCount => EntityTypeIds.Count == 0 ? 0 : _entityCount;
            public int UniqueEntityTypeCount => EntityTypeIds.Count;
            public IReadOnlyList<string> EntityTypeIds { get; }
            public SourceEntry Source { get; }
            public string RelativePath => Source.RelativePath;

            private int _entityCount => Source.EntityCount;
        }

        private sealed class SourceEntry
        {
            private SourceEntry()
            {
            }

            public string AbsolutePath { get; private set; }
            public string RelativePath { get; private set; }
            public string AssetPath { get; private set; }
            public string DisplayName { get; private set; }
            public string SummaryText { get; set; } = string.Empty;
            public SourceKind Kind { get; private set; }
            public bool Importable => !string.IsNullOrWhiteSpace(AssetPath);
            public int EntityCount { get; set; }
            public string KindLabel => Kind.ToString();

            public static SourceEntry Create(string absolutePath, string rootFolder)
            {
                var entry = new SourceEntry();
                entry.AbsolutePath = NormalizePath(absolutePath);
                entry.RelativePath = NormalizeRelativePath(rootFolder, absolutePath);
                entry.DisplayName = VulcanusImportHelpers.GetBaseName(absolutePath);
                entry.Kind = GetKind(absolutePath);

                VulcanusImportHelpers.TryAbsoluteToAssetPath(entry.AbsolutePath, out var assetPath);
                entry.AssetPath = assetPath;
                return entry;
            }

            public static SourceKind GetKind(string filePath)
            {
                var extension = Path.GetExtension(filePath);
                if (extension.Equals(".vproj", StringComparison.OrdinalIgnoreCase)) return SourceKind.Project;
                if (extension.Equals(".vmap", StringComparison.OrdinalIgnoreCase)) return SourceKind.Map;
                if (extension.Equals(".vts", StringComparison.OrdinalIgnoreCase)) return SourceKind.Tileset;
                if (extension.Equals(".vitm", StringComparison.OrdinalIgnoreCase)) return SourceKind.Item;
                return SourceKind.Unknown;
            }

            private static string NormalizeRelativePath(string rootFolder, string absolutePath)
            {
                var normalizedRoot = NormalizePath(rootFolder);
                var normalizedPath = NormalizePath(absolutePath);
                if (string.IsNullOrWhiteSpace(normalizedRoot) || !normalizedPath.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
                    return Path.GetFileName(normalizedPath);

                return normalizedPath[normalizedRoot.Length..].TrimStart('/');
            }
        }

        private enum SourceKind
        {
            Unknown,
            Project,
            Map,
            Tileset,
            Item
        }
    }

    internal static class StyleCompatExtensions
    {
        public static void SetRowGap(this IStyle style, float value)
        {
            style.marginBottom = value;
        }

        public static void SetColumnGap(this IStyle style, float value)
        {
            style.marginRight = value;
        }
    }
}