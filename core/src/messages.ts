/**
 * AUTO-GENERATED FROM core/asyncapi.yaml. DO NOT EDIT MANUALLY.
 *
 * Run `npm run asyncapi:generate` to regenerate.
 *
 * Source of truth: the yaml at core/asyncapi.yaml.
 * Editors and clients in any language can consume the spec directly.
 */

export type ServerMessage =
  | ProviderCapabilities
  | AgentCreated
  | AgentClosed
  | AgentDirectoryChanged
  | AgentSelected
  | ExistingAgents
  | AgentStatus
  | AgentToolStart
  | AgentToolDone
  | AgentToolsClear
  | AgentToolPermission
  | AgentToolPermissionClear
  | SubagentToolStart
  | SubagentToolDone
  | SubagentClear
  | SubagentToolPermission
  | AgentTeamInfo
  | AgentContextUsage
  | LayoutLoaded
  | FurnitureAssetsLoaded
  | CharacterSpritesLoaded
  | PetSpritesLoaded
  | FloorTilesLoaded
  | WallTilesLoaded
  | CarpetTilesLoaded
  | OfficeAccess
  | SettingsLoaded
  | BypassPermissionsUpdated
  | HooksStatus
  | HooksConsentRequest
  | ExternalAssetDirectoriesUpdated
  | AreaMappingsLoaded
  | DirectoriesLoaded
  | DirectorySaved
  | DirectoryRejected
  | DirectorySuggestions
  | TerminalAvailability
  | TerminalSessionOpened
  | TerminalSessionClosed
  | AgentDiagnostics
  | RoomsState
  | ReleaseResult
  | TasksState
  | SessionsInfo
  | ReplyResult
  | SessionMessages;

export type ClientMessage =
  | WebviewReady
  | LaunchAgent
  | FocusAgent
  | CloseAgent
  | SaveAgentSeats
  | SaveLayout
  | SetSoundEnabled
  | SetLastSeenVersion
  | SetAlwaysShowLabels
  | SetGhostHeadlessAgents
  | SetHooksEnabled
  | HooksConsentResponse
  | SetHooksInfoShown
  | SetWatchAllSessions
  | ExportLayout
  | ImportLayout
  | OpenSessionsFolder
  | AddExternalAssetDirectory
  | RemoveExternalAssetDirectory
  | SaveAreaMappings
  | SetShowAreas
  | SetBypassPermissions
  | SetShowHostDirectories
  | SaveDirectory
  | RemoveDirectory
  | RequestDirectorySuggestions
  | RequestDiagnostics
  | ReleaseRoom
  | StartTasks
  | CancelTask
  | SendToAgent
  | ReplyToSession
  | GetSessionMessages
  | AnswerPermission;

export interface ProviderCapabilities {
  type: 'providerCapabilities';
  readingTools: string[];
  subagentToolNames: string[];
}

export interface AgentCreated {
  type: 'agentCreated';
  id: number;
  directoryName?: string;
  isExternal?: boolean;
  palette?: number;
  hueShift?: number;
}

export interface AgentClosed {
  type: 'agentClosed';
  id: number;
}

export interface AgentDirectoryChanged {
  type: 'agentDirectoryChanged';
  id: number;
  directoryName: string;
}

export interface AgentSelected {
  type: 'agentSelected';
  id: number;
}

export interface ExistingAgents {
  type: 'existingAgents';
  agents: number[];
  agentMeta: Record<string, AgentSeatMeta>;
  directoryNames: Record<string, string>;
  externalAgents: Record<string, boolean>;
}

export interface AgentSeatMeta {
  palette?: number;
  hueShift?: number;
  seatId?: string;
}

export interface AgentStatus {
  type: 'agentStatus';
  id: number;
  status: AgentActivityStatus;
  awaitingInput?: boolean;
}

export type AgentActivityStatus = 'active' | 'waiting';

export interface AgentToolStart {
  type: 'agentToolStart';
  id: number;
  toolId: string;
  status: string;
  toolName?: string;
  permissionActive?: boolean;
  runInBackground?: boolean;
  isTeammateSpawn?: boolean;
}

export interface AgentToolDone {
  type: 'agentToolDone';
  id: number;
  toolId: string;
}

export interface AgentToolsClear {
  type: 'agentToolsClear';
  id: number;
}

export interface AgentToolPermission {
  type: 'agentToolPermission';
  id: number;
}

export interface AgentToolPermissionClear {
  type: 'agentToolPermissionClear';
  id: number;
}

export interface SubagentToolStart {
  type: 'subagentToolStart';
  id: number;
  parentToolId: string;
  toolId: string;
  status: string;
}

export interface SubagentToolDone {
  type: 'subagentToolDone';
  id: number;
  parentToolId: string;
  toolId: string;
}

export interface SubagentClear {
  type: 'subagentClear';
  id: number;
  parentToolId: string;
}

export interface SubagentToolPermission {
  type: 'subagentToolPermission';
  id: number;
  parentToolId: string;
}

export interface AgentTeamInfo {
  type: 'agentTeamInfo';
  id: number;
  teamName?: string;
  agentName?: string;
  isTeamLead?: boolean;
  leadAgentId?: number;
  teamUsesTmux?: boolean;
}

export interface AgentContextUsage {
  type: 'agentContextUsage';
  id: number;
  contextTokens: number;
  maxContextTokens: number;
}

export interface LayoutLoaded {
  type: 'layoutLoaded';
  layout: Record<string, any> | null;
  wasReset?: boolean;
}

export interface FurnitureAssetsLoaded {
  type: 'furnitureAssetsLoaded';
  catalog: FurnitureAssetMessage[];
  sprites: Record<string, string[][]>;
}

export interface FurnitureAssetMessage {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface CharacterSpritesLoaded {
  type: 'characterSpritesLoaded';
  characters: CharacterSpriteSet[];
}

export interface CharacterSpriteSet {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export interface PetSpritesLoaded {
  type: 'petSpritesLoaded';
  pets: PetSpriteFrameSet[];
  petNames: string[];
}

export interface PetSpriteFrameSet {
  walkDown: string[][][];
  idleDown: string[][][];
  walkUp: string[][][];
  idleUp: string[][][];
  walkRight: string[][][];
}

export interface FloorTilesLoaded {
  type: 'floorTilesLoaded';
  sprites: string[][][];
}

export interface WallTilesLoaded {
  type: 'wallTilesLoaded';
  sets: string[][][][];
}

export interface CarpetTilesLoaded {
  type: 'carpetTilesLoaded';
  sets: string[][][][];
}

export interface OfficeAccess {
  type: 'officeAccess';
  readOnly: boolean;
}

export interface SettingsLoaded {
  type: 'settingsLoaded';
  soundEnabled: boolean;
  lastSeenVersion: string;
  extensionVersion: string;
  watchAllSessions: boolean;
  alwaysShowLabels: boolean;
  ghostHeadlessAgents: boolean;
  hooksEnabled: boolean;
  hooksInfoShown: boolean;
  externalAssetDirectories: string[];
  showAreas: boolean;
  bypassPermissions: boolean;
  showHostDirectories: boolean;
}

export interface BypassPermissionsUpdated {
  type: 'bypassPermissionsUpdated';
  enabled: boolean;
}

export interface HooksStatus {
  type: 'hooksStatus';
  providerId: string;
  installed: boolean;
}

export interface HooksConsentRequest {
  type: 'hooksConsentRequest';
  providerId: string;
  headline: string;
  disclosure: string;
}

export interface ExternalAssetDirectoriesUpdated {
  type: 'externalAssetDirectoriesUpdated';
  dirs: string[];
}

export interface AreaMappingsLoaded {
  type: 'areaMappingsLoaded';
  mappings: Record<string, string[]>;
}

export interface DirectoriesLoaded {
  type: 'directoriesLoaded';
  directories: Directory[];
}

export interface Directory {
  name: string;
  path: string;
  source: DirectorySource;
}

export type DirectorySource = 'user' | 'host';

export interface DirectorySaved {
  type: 'directorySaved';
  directory: Directory;
}

export interface DirectoryRejected {
  type: 'directoryRejected';
  path: string;
  reason: string;
}

export interface DirectorySuggestions {
  type: 'directorySuggestions';
  paths: string[];
}

export interface TerminalAvailability {
  type: 'terminalAvailability';
  available: boolean;
  reason?: string;
}

export interface TerminalSessionOpened {
  type: 'terminalSessionOpened';
  agentId: number;
}

export interface TerminalSessionClosed {
  type: 'terminalSessionClosed';
  agentId: number;
  exitCode?: number;
}

export interface AgentDiagnostics {
  type: 'agentDiagnostics';
  agents: Record<string, any>[];
}

export interface RoomsState {
  type: 'roomsState';
  github: RoomsGithubState;
  rooms: RoomInfo[];
  needs: RoomNeed[];
}

export type RoomsGithubState = 'ok' | 'unavailable' | 'off';

export interface RoomInfo {
  label: string;
  project: string;
  path: string;
  branch: string | null;
  pr: RoomPullRequest | null;
  fields: Record<string, string>;
  port: number | null;
  devUrl: string | null;
  serverUp: boolean;
}

export interface RoomPullRequest {
  number: number;
  title: string;
  url: string;
  state: RoomPullRequestState;
  review: RoomReviewState | null;
  checks: RoomChecksState | null;
}

export type RoomPullRequestState = 'open' | 'draft' | 'merged' | 'closed';

export type RoomReviewState = 'approved' | 'changes-requested' | 'review-required';

export type RoomChecksState = 'passing' | 'failing' | 'pending';

export interface RoomNeed {
  id: string;
  kind: RoomNeedKind;
  room: string;
  title: string;
  url: string | null;
  prUrl: string | null;
}

export type RoomNeedKind =
  | 'changes-requested'
  | 'checks-failing'
  | 'ready-to-merge'
  | 'stale-worktree'
  | 'dev-server'
  | 'field';

export interface ReleaseResult {
  type: 'releaseResult';
  label: string;
  ok: boolean;
  needs: ReleaseNeed | null;
  message: string;
  files: string[];
}

export type ReleaseNeed = 'open-pr' | 'agents' | 'dirty';

export interface TasksState {
  type: 'tasksState';
  tasks: TaskInfo[];
  maxActive: number;
  active: number;
  splitting: boolean;
}

export interface TaskInfo {
  id: string;
  title: string;
  prompt: string;
  project: string;
  room: string | null;
  agentId: number | null;
  status: TaskStatus;
  detail: string;
  tokens: number;
}

export type TaskStatus =
  'queued' | 'preparing' | 'starting' | 'blocked' | 'running' | 'done' | 'failed';

export interface SessionsInfo {
  type: 'sessionsInfo';
  sessions: SessionInfo[];
}

export interface SessionInfo {
  id: number;
  title: string | null;
  lastActivityAt: number | null;
  lastText: string | null;
  prNumbers: number[];
  app: string | null;
}

export interface ReplyResult {
  type: 'replyResult';
  agentId: number;
  ok: boolean;
  message: string;
}

export interface SessionMessages {
  type: 'sessionMessages';
  agentId: number;
  messages: ConversationMessage[];
  truncated: boolean;
}

export interface ConversationMessage {
  role: ConversationRole;
  at: number | null;
  text: string;
}

export type ConversationRole = 'user' | 'assistant';

export interface WebviewReady {
  type: 'webviewReady';
}

export interface LaunchAgent {
  type: 'launchAgent';
  directoryPath?: string;
}

export interface FocusAgent {
  type: 'focusAgent';
  id: number;
}

export interface CloseAgent {
  type: 'closeAgent';
  id: number;
}

export interface SaveAgentSeats {
  type: 'saveAgentSeats';
  seats: Record<string, SeatAssignment>;
}

export interface SeatAssignment {
  palette: number;
  hueShift: number;
  seatId: string | null;
}

export interface SaveLayout {
  type: 'saveLayout';
  layout: Record<string, any>;
}

export interface SetSoundEnabled {
  type: 'setSoundEnabled';
  enabled: boolean;
}

export interface SetLastSeenVersion {
  type: 'setLastSeenVersion';
  version: string;
}

export interface SetAlwaysShowLabels {
  type: 'setAlwaysShowLabels';
  enabled: boolean;
}

export interface SetGhostHeadlessAgents {
  type: 'setGhostHeadlessAgents';
  enabled: boolean;
}

export interface SetHooksEnabled {
  type: 'setHooksEnabled';
  providerId: string;
  enabled: boolean;
}

export interface HooksConsentResponse {
  type: 'hooksConsentResponse';
  providerId: string;
  choice: HooksConsentChoice;
}

export type HooksConsentChoice = 'install' | 'notNow' | 'never';

export interface SetHooksInfoShown {
  type: 'setHooksInfoShown';
}

export interface SetWatchAllSessions {
  type: 'setWatchAllSessions';
  enabled: boolean;
}

export interface ExportLayout {
  type: 'exportLayout';
}

export interface ImportLayout {
  type: 'importLayout';
}

export interface OpenSessionsFolder {
  type: 'openSessionsFolder';
}

export interface AddExternalAssetDirectory {
  type: 'addExternalAssetDirectory';
  path?: string;
}

export interface RemoveExternalAssetDirectory {
  type: 'removeExternalAssetDirectory';
  path: string;
}

export interface SaveAreaMappings {
  type: 'saveAreaMappings';
  mappings: Record<string, string[]>;
}

export interface SetShowAreas {
  type: 'setShowAreas';
  enabled: boolean;
}

export interface SetBypassPermissions {
  type: 'setBypassPermissions';
  enabled: boolean;
}

export interface SetShowHostDirectories {
  type: 'setShowHostDirectories';
  enabled: boolean;
}

export interface SaveDirectory {
  type: 'saveDirectory';
  name: string;
  path: string;
  previousPath?: string;
}

export interface RemoveDirectory {
  type: 'removeDirectory';
  path: string;
}

export interface RequestDirectorySuggestions {
  type: 'requestDirectorySuggestions';
}

export interface RequestDiagnostics {
  type: 'requestDiagnostics';
}

export interface ReleaseRoom {
  type: 'releaseRoom';
  label: string;
  confirmOpenPr?: boolean;
  confirmAgents?: boolean;
  confirmDirty?: boolean;
}

export interface StartTasks {
  type: 'startTasks';
  text: string;
  images?: string[];
}

export interface CancelTask {
  type: 'cancelTask';
  id: string;
}

export interface SendToAgent {
  type: 'sendToAgent';
  agentId: number;
  text: string;
}

export interface ReplyToSession {
  type: 'replyToSession';
  agentId: number;
  text: string;
  images?: string[];
}

export interface GetSessionMessages {
  type: 'getSessionMessages';
  agentId: number;
  limit?: number;
}

export interface AnswerPermission {
  type: 'answerPermission';
  agentId: number;
  allow: boolean;
}
