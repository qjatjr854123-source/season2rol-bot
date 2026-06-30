require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

// 데이터 저장 경로
const DATA_PATH = './data.json';
if (!fs.existsSync(DATA_PATH)) {
  fs.writeFileSync(DATA_PATH, JSON.stringify({ users: {}, matches: [] }));
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// 현재 내전 세션
let session = null;

const commands = [
  {
    name: '등록',
    description: '내 티어를 등록합니다',
    options: [
      {
        name: '티어',
        description: '예: 아이언, 브론즈, 실버, 골드, 플래티넘, 다이아, 마스터, 챌린저',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: '내전모집',
    description: '내전 참가자 모집을 시작합니다',
    options: [
      {
        name: '인원',
        description: '모집 인원 (기본 10)',
        type: 4,
        required: false,
      },
    ],
  },
  {
    name: '팀짜기',
    description: '티어 기반으로 A/B팀을 자동 배분합니다',
  },
  {
    name: '결과',
    description: '내전 결과를 입력합니다',
    options: [
      {
        name: '승리팀',
        description: 'A 또는 B',
        type: 3,
        required: true,
        choices: [
          { name: 'A팀 승리', value: 'A' },
          { name: 'B팀 승리', value: 'B' },
        ],
      },
    ],
  },
  {
    name: '전적',
    description: '유저의 전적을 확인합니다',
    options: [
      {
        name: '유저',
        description: '확인할 유저 (미입력시 본인)',
        type: 6,
        required: false,
      },
    ],
  },
  {
    name: '랭킹',
    description: '서버 내전 랭킹을 확인합니다',
  },
  {
    name: '서버설정',
    description: '내전 서버 채널 구조를 자동으로 생성합니다 (운영진 전용)',
  },
  {
    name: '서버초기화',
    description: '모든 채널을 삭제하고 처음부터 다시 만듭니다 (운영진 전용)',
  },
  {
    name: 'mvp',
    description: 'MVP를 지정합니다',
    options: [
      {
        name: '유저',
        description: 'MVP로 지정할 유저',
        type: 6,
        required: true,
      },
    ],
  },
];

function hasRole(member, roleName) {
  return member.roles.cache.some(r => r.name === roleName);
}

function isOwner(member) {
  return hasRole(member, '운영자') || member.permissions.has('Administrator');
}

function isStaff(member) {
  return isOwner(member) || hasRole(member, '부관리자');
}

async function setupChannels(guild) {
  const { ChannelType } = require('discord.js');
  const structure = [
    {
      name: '📢 정보', type: ChannelType.GuildCategory,
      children: [
        { name: '공지', type: ChannelType.GuildText },
        { name: '규칙', type: ChannelType.GuildText },
        { name: '봇-사용법', type: ChannelType.GuildText },
      ],
    },
    {
      name: '💬 커뮤니티', type: ChannelType.GuildCategory,
      children: [
        { name: '자유수다', type: ChannelType.GuildText },
        { name: '자랑', type: ChannelType.GuildText },
        { name: '폼-정보', type: ChannelType.GuildText },
      ],
    },
    {
      name: '⚔️ 내전', type: ChannelType.GuildCategory,
      children: [
        { name: '모집', type: ChannelType.GuildText },
        { name: '팀-구성', type: ChannelType.GuildText },
        { name: '전적', type: ChannelType.GuildText },
        { name: 'mvp-투표', type: ChannelType.GuildText },
      ],
    },
    {
      name: '🎵 음악', type: ChannelType.GuildCategory,
      children: [
        { name: '음악-신청', type: ChannelType.GuildText },
        { name: '플레이리스트', type: ChannelType.GuildText },
      ],
    },
    {
      name: '🔊 내전 음성', type: ChannelType.GuildCategory,
      children: [
        { name: '대기실', type: ChannelType.GuildVoice },
        { name: 'A팀방', type: ChannelType.GuildVoice },
        { name: 'B팀방', type: ChannelType.GuildVoice },
      ],
    },
    {
      name: '🎯 파티모집', type: ChannelType.GuildCategory,
      children: [
        { name: '칼바람', type: ChannelType.GuildText },
        { name: '듀오랭크', type: ChannelType.GuildText },
        { name: '자유랭크', type: ChannelType.GuildText },
        { name: '롤토체스', type: ChannelType.GuildText },
        { name: '아레나', type: ChannelType.GuildText },
      ],
    },
    {
      name: '🎮 소환사의협곡', type: ChannelType.GuildCategory,
      children: [{ name: '소환사의협곡 생성', type: ChannelType.GuildVoice }],
    },
    {
      name: '🎲 무작위 충력전', type: ChannelType.GuildCategory,
      children: [{ name: '무작위충력전 생성', type: ChannelType.GuildVoice }],
    },
    {
      name: '♟️ 롤토체스', type: ChannelType.GuildCategory,
      children: [{ name: '롤토체스 생성', type: ChannelType.GuildVoice }],
    },
    {
      name: '🕹️ 종합게임', type: ChannelType.GuildCategory,
      children: [{ name: '종합게임 생성', type: ChannelType.GuildVoice }],
    },
    {
      name: '📞 자유통화', type: ChannelType.GuildCategory,
      children: [{ name: '자유통화 생성', type: ChannelType.GuildVoice }],
    },
    {
      name: '🛠️ 스태프', type: ChannelType.GuildCategory,
      children: [
        { name: '운영-로그', type: ChannelType.GuildText },
        { name: '건의함', type: ChannelType.GuildText },
      ],
    },
  ];

  for (const cat of structure) {
    const category = await guild.channels.create({ name: cat.name, type: cat.type });
    for (const ch of cat.children) {
      await guild.channels.create({ name: ch.name, type: ch.type, parent: category.id });
    }
  }

  const roles = [
    { name: '운영자', color: 0xFF0000, permissions: ['Administrator'] },
    { name: '부관리자', color: 0xFF8C00, permissions: ['ManageChannels', 'ManageMessages', 'KickMembers'] },
    { name: '멤버', color: 0x4169E1, permissions: [] },
  ];

  for (const role of roles) {
    const exists = guild.roles.cache.find(r => r.name === role.name);
    if (!exists) {
      await guild.roles.create({ name: role.name, color: role.color, permissions: role.permissions });
    }
  }
}

const TIER_SCORE = {
  '아이언': 1, '브론즈': 2, '실버': 3, '골드': 4,
  '플래티넘': 5, '에메랄드': 6, '다이아': 7,
  '마스터': 8, '그랜드마스터': 9, '챌린저': 10,
};

const TIER_EMOJI = {
  '아이언': '⬛', '브론즈': '🟫', '실버': '⬜', '골드': '🟡',
  '플래티넘': '🟢', '에메랄드': '💚', '다이아': '💎',
  '마스터': '🔮', '그랜드마스터': '🔴', '챌린저': '👑', '미등록': '❓',
};

function tierLabel(tier) {
  return `${TIER_EMOJI[tier] || '❓'} ${tier}`;
}

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} 온라인!`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ 슬래시 명령어 등록 완료');
  } catch (err) {
    console.error('명령어 등록 실패:', err);
  }

});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === 'join') {
      if (!session) return interaction.reply({ content: '모집 중인 내전이 없습니다.', ephemeral: true });
      if (session.players.find(p => p.id === interaction.user.id)) {
        return interaction.reply({ content: '이미 참가했습니다.', ephemeral: true });
      }
      if (session.players.length >= session.max) {
        return interaction.reply({ content: '인원이 꽉 찼습니다.', ephemeral: true });
      }

      const data = loadData();
      const userData = data.users[interaction.user.id];
      const tier = userData?.tier || '미등록';

      session.players.push({ id: interaction.user.id, name: interaction.user.username, tier });

      await interaction.reply({
        content: `✅ **${interaction.user.username}** (${tierLabel(tier)}) 참가! [${session.players.length}/${session.max}]`,
      });

      if (session.players.length >= session.max) {
        await interaction.followUp('✅ 인원이 다 찼습니다! `/팀짜기`를 입력해주세요.');
      }
    }

    if (interaction.customId === 'cancel') {
      if (!session) return interaction.reply({ content: '모집 중인 내전이 없습니다.', ephemeral: true });
      const idx = session.players.findIndex(p => p.id === interaction.user.id);
      if (idx === -1) return interaction.reply({ content: '참가하지 않았습니다.', ephemeral: true });
      session.players.splice(idx, 1);
      await interaction.reply({ content: `❌ **${interaction.user.username}** 참가 취소. [${session.players.length}/${session.max}]` });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === '등록') {
    const tier = interaction.options.getString('티어');
    if (!TIER_SCORE[tier]) {
      return interaction.reply({ content: `❌ 올바른 티어를 입력해주세요.\n(아이언/브론즈/실버/골드/플래티넘/에메랄드/다이아/마스터/그랜드마스터/챌린저)`, ephemeral: true });
    }
    const data = loadData();
    if (!data.users[interaction.user.id]) {
      data.users[interaction.user.id] = { name: interaction.user.username, tier, wins: 0, losses: 0, mvp: 0 };
    } else {
      data.users[interaction.user.id].tier = tier;
    }
    saveData(data);
    await interaction.reply(`✅ **${interaction.user.username}**님 티어 **${tierLabel(tier)}** 등록 완료!`);
  }

  else if (commandName === '내전모집') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ 부관리자 이상만 사용할 수 있습니다.', ephemeral: true });
    }
    const max = interaction.options.getInteger('인원') || 10;
    session = { players: [], max, teamA: [], teamB: [] };

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join').setLabel('✅ 참가').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('cancel').setLabel('❌ 취소').setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      content: `🎮 **내전 모집 시작!** (0/${max})\n아래 버튼으로 참가/취소하세요.`,
      components: [row],
    });
  }

  else if (commandName === '팀짜기') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ 부관리자 이상만 사용할 수 있습니다.', ephemeral: true });
    }
    if (!session || session.players.length < 2) {
      return interaction.reply({ content: '참가자가 2명 이상이어야 합니다.', ephemeral: true });
    }

    const sorted = [...session.players].sort((a, b) => (TIER_SCORE[b.tier] || 0) - (TIER_SCORE[a.tier] || 0));
    session.teamA = [];
    session.teamB = [];

    sorted.forEach((p, i) => {
      if (i % 2 === 0) session.teamA.push(p);
      else session.teamB.push(p);
    });

    const fmt = (team) => team.map(p => `• ${p.name} (${tierLabel(p.tier)})`).join('\n');

    await interaction.reply(
      `⚔️ **팀 편성 완료!**\n\n🔵 **A팀**\n${fmt(session.teamA)}\n\n🔴 **B팀**\n${fmt(session.teamB)}\n\n결과 입력: \`/결과\``
    );
  }

  else if (commandName === '결과') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ 부관리자 이상만 사용할 수 있습니다.', ephemeral: true });
    }
    if (!session || !session.teamA.length) {
      return interaction.reply({ content: '팀 편성이 되어있지 않습니다.', ephemeral: true });
    }

    const winner = interaction.options.getString('승리팀');
    const winners = winner === 'A' ? session.teamA : session.teamB;
    const losers = winner === 'A' ? session.teamB : session.teamA;

    const data = loadData();
    winners.forEach(p => {
      if (!data.users[p.id]) data.users[p.id] = { name: p.name, tier: p.tier, wins: 0, losses: 0, mvp: 0 };
      data.users[p.id].wins++;
    });
    losers.forEach(p => {
      if (!data.users[p.id]) data.users[p.id] = { name: p.name, tier: p.tier, wins: 0, losses: 0, mvp: 0 };
      data.users[p.id].losses++;
    });

    data.matches.push({ date: new Date().toISOString(), winner, teamA: session.teamA, teamB: session.teamB });
    saveData(data);
    session = null;

    await interaction.reply(`🏆 **${winner}팀 승리!** 전적이 저장되었습니다.`);
  }

  else if (commandName === '전적') {
    const target = interaction.options.getUser('유저') || interaction.user;
    const data = loadData();
    const u = data.users[target.id];

    if (!u) return interaction.reply({ content: `${target.username}님의 전적이 없습니다.`, ephemeral: true });

    const total = u.wins + u.losses;
    const rate = total > 0 ? Math.round((u.wins / total) * 100) : 0;

    await interaction.reply(
      `📊 **${target.username}** 전적\n티어: ${tierLabel(u.tier)}\n승: ${u.wins} / 패: ${u.losses} / 승률: ${rate}%\nMVP: ${u.mvp}회`
    );
  }

  else if (commandName === '랭킹') {
    const data = loadData();
    const sorted = Object.entries(data.users)
      .map(([id, u]) => ({ ...u, id }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 10);

    if (!sorted.length) return interaction.reply('아직 전적 데이터가 없습니다.');

    const list = sorted.map((u, i) => `${i + 1}. **${u.name}** (${tierLabel(u.tier)}) - ${u.wins}승 ${u.losses}패`).join('\n');
    await interaction.reply(`🏅 **서버 랭킹 TOP 10**\n\n${list}`);
  }

  else if (commandName === '서버초기화') {
    if (!isOwner(interaction.member)) {
      return interaction.reply({ content: '❌ 운영자만 사용할 수 있습니다.', ephemeral: true });
    }
    await interaction.deferReply();
    const channels = interaction.guild.channels.cache;
    for (const [, ch] of channels) {
      await ch.delete().catch(() => {});
    }
    await interaction.followUp('✅ 모든 채널 삭제 완료! 이제 `/서버설정` 입력하세요.');
  }

  else if (commandName === '서버설정') {
    if (!isOwner(interaction.member)) {
      return interaction.reply({ content: '❌ 운영자만 사용할 수 있습니다.', ephemeral: true });
    }
    await interaction.deferReply();
    await setupChannels(interaction.guild);
    await interaction.editReply('✅ 서버 채널 구조 생성 완료!');
  }

  else if (commandName === 'mvp') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ 부관리자 이상만 사용할 수 있습니다.', ephemeral: true });
    }
    const target = interaction.options.getUser('유저');
    const data = loadData();

    if (!data.users[target.id]) {
      data.users[target.id] = { name: target.username, tier: '미등록', wins: 0, losses: 0, mvp: 0 };
    }
    data.users[target.id].mvp++;
    saveData(data);

    await interaction.reply(`⭐ **${target.username}**님이 MVP로 선정되었습니다! (누적 ${data.users[target.id].mvp}회)`);
  }
});

// 자동 음성채널 생성/삭제
const autoChannels = new Set(); // 봇이 만든 채널 ID 저장

client.on('voiceStateUpdate', async (oldState, newState) => {
  const { ChannelType } = require('discord.js');

  // 생성 채널 입장 감지
  if (newState.channel && newState.channel.name.endsWith(' 생성')) {
    const category = newState.channel.parent;
    const baseName = newState.channel.name.replace(' 생성', '');
    const member = newState.member;

    const newChannel = await newState.guild.channels.create({
      name: `${baseName} - ${member.displayName}`,
      type: ChannelType.GuildVoice,
      parent: category?.id,
    });

    autoChannels.add(newChannel.id);
    await member.voice.setChannel(newChannel);
  }

  // 자동 생성된 채널이 비면 삭제
  if (oldState.channel && autoChannels.has(oldState.channel.id)) {
    if (oldState.channel.members.size === 0) {
      await oldState.channel.delete().catch(() => {});
      autoChannels.delete(oldState.channel.id);
    }
  }
});

client.login(TOKEN);
