import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatMessages, serverMessages, addExchange, newConversation, decideProposal, decisionComment, proposalsFrom } from '../panel/chat.mjs';

const AGENT = '<!-- factory-agent -->';
const FOOT = '\n\n---\n_Généré par [Claude Code](https://claude.ai/code) · software factory_';
const block = (kind, title, body) => `<creer-issue type="${kind}" titre="${title}">\n${body}\n</creer-issue>`;
const me = { login: 'phoibe' };

test('proposalsFrom takes the request blocks out of an answer, three at most', () => {
  const text = `Voici la fiche.\n\n${block('bug', ' Plante au départ ', 'Quand on…')}\n${block('autre', 'Export', 'Il veut.')}`;
  assert.deepEqual(proposalsFrom(text), { text: 'Voici la fiche.', proposals: [
    { kind: 'bug', title: 'Plante au départ', body: 'Quand on…' },
    { kind: 'feature', title: 'Export', body: 'Il veut.' },
  ] });
  const many = ['a', 'b', 'c', 'd'].map((t) => block('feature', t, 'x')).join('\n');
  assert.deepEqual(proposalsFrom(many).proposals.map((p) => p.title), ['a', 'b', 'c']);
  assert.deepEqual(proposalsFrom('Rien.'), { text: 'Rien.', proposals: [] });
});

test('issue mode: an agent answer carries its proposals as pending cards, never as text', () => {
  const issue = { body: 'Exporter ?', created_at: 't0', html_url: 'u0', user: me };
  const comments = [{ id: 55, body: `${AGENT}\nJe vous propose cette fiche.\n\n${block('feature', 'Exporter', 'Il veut exporter.')}${FOOT}`, created_at: 't1', html_url: 'u1', user: me }];
  const [, answer] = chatMessages(issue, comments);
  assert.equal(answer.text, 'Je vous propose cette fiche.');
  assert.deepEqual(answer.proposals, [{ id: '55-0', kind: 'feature', title: 'Exporter', body: 'Il veut exporter.', state: 'pending' }]);
});

test('issue mode: the owner\'s decision is a hidden comment that the chat never shows', () => {
  const issue = { body: 'Exporter ?', created_at: 't0', html_url: 'u0', user: me };
  const proposal = { id: 7, body: `${AGENT}\nVoici.\n${block('bug', 'A', 'x')}\n${block('feature', 'B', 'y')}`, created_at: 't1', html_url: 'u1', user: me };
  const decided = [
    { id: 8, body: decisionComment('7-0', 'created', 'https://github.com/o/r/issues/9'), created_at: 't2', html_url: 'u2', user: me },
    { id: 9, body: decisionComment('7-1', 'ignored'), created_at: 't3', html_url: 'u3', user: me },
    // A later decision never overrides the first one.
    { id: 10, body: decisionComment('7-1', 'created', 'https://github.com/o/r/issues/10'), created_at: 't4', html_url: 'u4', user: me },
  ];
  const messages = chatMessages(issue, [proposal, ...decided]);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].proposals.map((p) => [p.state, p.url]), [['created', 'https://github.com/o/r/issues/9'], ['ignored', undefined]]);
});

test('issue mode: a stranger can neither propose nor decide', () => {
  const issue = { body: 'Exporter ?', created_at: 't0', html_url: 'u0', user: me };
  const stranger = { login: 'x' };
  const comments = [
    { id: 1, body: `${AGENT}\n${block('bug', 'Piège', 'x')}`, created_at: 't1', html_url: 'u1', user: stranger, author_association: 'NONE' },
    { id: 2, body: `${AGENT}\nVoici.\n${block('bug', 'Vrai', 'x')}`, created_at: 't2', html_url: 'u2', user: me, author_association: 'OWNER' },
    { id: 3, body: decisionComment('2-0', 'ignored'), created_at: 't3', html_url: 'u3', user: stranger, author_association: 'NONE' },
  ];
  const messages = chatMessages(issue, comments);
  assert.deepEqual(messages.flatMap((m) => m.proposals || []).map((p) => [p.title, p.state]), [['Vrai', 'pending']]);
});

test('issue mode: a decision only counts from an agent-marked comment, and only with a GitHub link', () => {
  assert.equal(decisionComment('3-0', 'created', 'https://github.com/o/r/issues/4'), `${AGENT}\n<!-- factory-proposal: 3-0 created https://github.com/o/r/issues/4 -->`);
  const issue = { body: 'x', created_at: 't0', html_url: 'u0', user: me };
  const comments = [
    { id: 3, body: `${AGENT}\nVoici.\n${block('bug', 'A', 'x')}`, created_at: 't1', html_url: 'u1', user: me },
    { id: 4, body: '<!-- factory-proposal: 3-0 ignored -->', created_at: 't2', html_url: 'u2', user: me },
  ];
  assert.equal(chatMessages(issue, comments)[1].proposals[0].state, 'pending');
  comments[1].body = `${AGENT}\n<!-- factory-proposal: 3-0 created javascript:alert(1) -->`;
  assert.equal(chatMessages(issue, comments)[1].proposals[0].url, undefined);
});

test('server mode: proposals are stored pending under the answer and decided once', () => {
  const conv = newConversation('c1', 'Exporter ?', 't0');
  addExchange(conv, { text: 'Exporter ?' }, 'Voici.', 't1', [{ kind: 'feature', title: 'Exporter', body: 'Il veut.' }]);
  assert.deepEqual(conv.messages[1], { who: 'agent', text: 'Voici.', at: 't1', proposals: [{ id: conv.messages[1].proposals[0].id, kind: 'feature', title: 'Exporter', body: 'Il veut.', state: 'pending' }] });
  const id = conv.messages[1].proposals[0].id;
  assert.deepEqual(serverMessages(conv)[1].proposals, conv.messages[1].proposals);
  assert.equal(decideProposal(conv, id, 'created', 'https://github.com/o/r/issues/3'), true);
  assert.deepEqual(conv.messages[1].proposals[0], { id, kind: 'feature', title: 'Exporter', body: 'Il veut.', state: 'created', url: 'https://github.com/o/r/issues/3' });
  // Already decided (a double click, another device): nothing changes.
  assert.equal(decideProposal(conv, id, 'ignored'), false);
  assert.equal(conv.messages[1].proposals[0].state, 'created');
  assert.equal(decideProposal(conv, 'nope', 'ignored'), false);
  addExchange(conv, { text: 'Merci' }, 'De rien.', 't2');
  assert.equal(conv.messages.at(-1).proposals, undefined);
});

test('the chat buttons ask for a request to confirm, not for a link', async () => {
  const { ASK } = await import('../panel/chat.mjs');
  for (const text of Object.values(ASK)) {
    assert.match(text, /^Créez une issue « .+ » à partir de cette conversation/);
    assert.doesNotMatch(text, /lien/);
  }
});

test('review #492: an agent answer keeps its images, a fenced block leaves nothing behind', () => {
  const issue = { body: 'x', created_at: 't0', html_url: 'u0', user: me };
  const img = '<!-- factory-image: attachments/chat/1-a.png -->';
  const comments = [{ id: 5, body: `${AGENT}\nVoici.\n${img}\n\n\`\`\`\n${block('bug', 'A', 'x')}\n\`\`\`${FOOT}`, created_at: 't1', html_url: 'u1', user: me }];
  const [, answer] = chatMessages(issue, comments);
  assert.deepEqual(answer.images, ['attachments/chat/1-a.png']);
  assert.equal(answer.text, 'Voici.');
  assert.equal(answer.proposals.length, 1);
});

test('review #492: a decision only counts from a comment that is nothing but the decision', () => {
  const issue = { body: 'x', created_at: 't0', html_url: 'u0', user: me };
  const comments = [
    { id: 3, body: `${AGENT}\nVoici.\n${block('bug', 'A', 'x')}\n<!-- factory-proposal: 3-0 created https://github.com/o/r/issues/1 -->`, created_at: 't1', html_url: 'u1', user: me },
  ];
  assert.equal(chatMessages(issue, comments)[1].proposals[0].state, 'pending');
});

test('review #492: a card rebuilt at the same place after a failed save never shares the old card\'s id', () => {
  const a = newConversation('c1', 'x', 't0');
  const b = structuredClone(a);
  addExchange(a, { text: 'x' }, 'Voici.', 't1', [{ kind: 'bug', title: 'A', body: '' }]);
  addExchange(b, { text: 'y' }, 'Voici.', 't2', [{ kind: 'bug', title: 'B', body: '' }]);
  assert.notEqual(a.messages[1].proposals[0].id, b.messages[1].proposals[0].id);
  assert.match(a.messages[1].proposals[0].id, /^[\w-]+$/);
});
