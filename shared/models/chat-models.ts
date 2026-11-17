import { AgentChatSetting } from "./chat-settings";
import React from "react";

export const DefaultLogoUrl = '/icons/chatbotlogo.webp';

export interface IInitialState { 
  userName: string;
  jwtCallbackTokenSub: string;
  jwtCallbackTokenSiteId: string;
  selectedTenantGuid: string;
  screenView: ScreenView;
  chatOpened: boolean;
  displayWelcomeMessage: boolean;
  subscribedChat: boolean;
  webChatDto: WebChat; 
  webchatHeight: number;
  messageHeight: number;
  message: string;
  agentChatSettings: AgentChatSetting;
  isThinking: boolean;
}

export interface IDataContext extends IInitialState {
  updateState: (updates: Partial<IInitialState>) => void;
}

export enum ScreenView {
  Welcome = 10,
  Chat = 20,
  VoiceChat = 30
}

export enum UserType {
  StaffUser = 10,
  Customer = 20,
  Anonymous = 30
}

export class WebChat {
  Session: string = '';
  Lang: string = '';
  Status: WebChatStatus = WebChatStatus.New;
  ForceOpen: boolean = false;
  CreateDate: string = '';
  LastUpdatedDate: string = '';
}


export enum WebchatPosition {
  Middle = 1,
  Left = 2,
  Right = 3,
  Draggable = 4
}

export enum WebchatLogoPosition {
  Middle = 1,
  Left = 2,
  Right = 3
}

export enum WebChatStatus {
  New = 0,
  Active = 10,
  Closed = 20
}


export class Prompt {
  id: number = 0;
  title: string = '';
  prompt: string = '';
}

// export class WebChatSettings {
//   application: string = '';
//   webchatPosition: WebchatPosition = WebchatPosition.Right; 
//   logoPosition: WebchatLogoPosition = WebchatLogoPosition.Right; 
//   mainColour: string = '';
//   iconUrl: string = DefaultLogoUrl;
//   logoUrl: string = DefaultLogoUrl;
//   assistantIconUrl: string = DefaultLogoUrl;
//   primaryTextColour: string = '';
//   secondaryTextColour: string = '';
//   cssUrl: string = '';
//   welcomeTitle: string = '';
//   welcomeSubTitle: string = '';
//   startChatTitle: string = '';
//   startChatSubTitle: string = '';
//   initialPrompts: Prompt[] = [];
//   isVoiceChatEnabled: boolean = false;
//   voiceChatbotVoiceName: string = '';
//   voiceChatbotLanguage: string = '';
//   voiceChatbotPrompt: string = '';
// }

export const initialState: IInitialState = { 
  userName: '',
  jwtCallbackTokenSub: '',
  jwtCallbackTokenSiteId: '',
  selectedTenantGuid: '',
  screenView: ScreenView.Welcome, 
  chatOpened: false,
  displayWelcomeMessage: true,
  subscribedChat: false,
  webChatDto: new WebChat(),
  webchatHeight: 500,
  messageHeight: 56,
  message: '',
  agentChatSettings: {
    primaryColor: '#3b82f6',
    foregroundColor: '#ffffff',
    bubbleStyle: 'rounded',
    floatingPosition: 'right',
    launcherStyle: 'circle',
    showDescription: true,
    chainOfThought: false,
    apiEndpoint: '',
    agentId: 0,
    isWidget: false,
    isShareable: false,
    shareId: '',
    securityConfiguration: { type: 'none' },
    isVoiceChatEnabled: false,
    chatBotVoiceApiUrl: '',
    chatBotVoiceApiAccessToken: '',
    bubbleIconPath: '',
    chatbotIconPath: '',
    cssUrl: '',
    welcomeMessage: '',
    predefinedPrompts: []
  } as AgentChatSetting,
  isThinking: false
};

export const DataContext = React.createContext<IDataContext>({
  ...initialState,
  updateState: () => {}
});